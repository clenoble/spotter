import '$lib/linkedin/adapter';
import { adapterFor } from '$lib/feed-adapter';
import type { RawPost, RankResult, EvalBucket, EvalLabelEntry } from '$shared/types';
import type {
  ScoreRequest,
  ScoreResponse,
  LogRequest,
  LabelRequest,
  LabelResponse
} from '$shared/messages';

const found = adapterFor(location.href);

if (!found) {
  console.log('[spotter] no feed adapter matched', location.href);
} else {
  const adapter = found;
  console.log('[spotter] adapter active:', adapter.platform);

  const scores = new Map<string, RankResult>();
  const postsById = new Map<string, RawPost>();
  const queue: RawPost[] = [];
  let processing = false;
  let warnedNoLLM = false;
  let seenCount = 0;

  async function scoreViaBackground(post: RawPost): Promise<RankResult> {
    // Everything the engine scores, minus the DOM handle — `Content` is the
    // host-agnostic shape, and the element cannot cross the message boundary.
    const req: ScoreRequest = {
      type: 'spotter:score',
      post: {
        id: post.id,
        platform: post.platform,
        authorHandle: post.authorHandle,
        authorName: post.authorName,
        text: post.text,
        mediaTypes: post.mediaTypes,
        postedAt: post.postedAt
      }
    };
    const res = (await chrome.runtime.sendMessage(req)) as ScoreResponse | undefined;
    if (!res) throw new Error('no response from background');
    if (!res.ok) throw new Error(res.error);
    return res.result;
  }

  async function drain() {
    if (processing) return;
    processing = true;
    while (queue.length) {
      const post = queue.shift()!;
      const t0 = performance.now();
      try {
        const result = await scoreViaBackground(post);
        scores.set(post.id, result);
        annotate(post, result);
        scheduleReorder();
        sendLog(post, result);
        const ms = Math.round(performance.now() - t0);
        const gate = result.gate < 0.999 ? ` ×${result.gate.toFixed(2)}` : '';
        console.log(
          `[spotter] scored ${post.authorName || post.authorHandle}: ${Math.round(result.score)}${gate} (${ms}ms) — ${result.reason}`
        );
        if (result.degraded) {
          console.warn('[spotter] degraded scoring for', post.id, result.failures);
        }
      } catch (err) {
        if (!warnedNoLLM) {
          console.warn(
            '[spotter] LLM scoring failed. Check: (1) Ollama running on http://localhost:11434, (2) `ollama pull qwen2.5:3b`, (3) OLLAMA_ORIGINS includes chrome-extension://* (restart Ollama after setting). Error:',
            err
          );
          warnedNoLLM = true;
        }
      }
    }
    processing = false;
  }

  function enqueue(post: RawPost) {
    postsById.set(post.id, post);
    queue.push(post);
    void drain();
  }

  function sendLog(post: RawPost, rank: RankResult) {
    const req: LogRequest = {
      type: 'spotter:log',
      post: {
        id: post.id,
        platform: post.platform,
        authorHandle: post.authorHandle,
        authorName: post.authorName,
        text: post.text,
        mediaTypes: post.mediaTypes
      },
      rank,
      engagement: [],
      dwellMs: null,
      seenAt: new Date().toISOString()
    };
    // Fire-and-forget: the SW will persist when the analyst model is free.
    chrome.runtime.sendMessage(req).catch(() => undefined);
  }

  /**
   * Plan Visibility (spec §1.2): the badge is not just a number, it is the
   * explanation. Hovering gives the whole vector — every axis that ran, what it
   * said, and the arithmetic from contribution to final score. A demoted post
   * is marked as demoted, and a degraded run says so on its face rather than
   * quietly returning a number nobody can tell is untrustworthy.
   */
  function explain(result: RankResult): string {
    const lines = result.axes.map(a => {
      const value =
        a.kind === 'gate' ? `×${a.score.toFixed(2)}` : String(Math.round(a.score));
      const flag = a.ok ? '' : ' [could not judge]';
      return `${a.axis} ${value}${flag} — ${a.reason}`;
    });
    if (result.gate < 0.999) {
      lines.push(
        `= ${Math.round(result.score)} (demoted from ${Math.round(result.contribution)})`
      );
    }
    for (const f of result.failures) lines.push(`⚠ ${f.axis} ${f.kind}: ${f.message}`);
    return lines.join('\n');
  }

  function annotate(post: RawPost, result: RankResult) {
    const el = post.element as HTMLElement;
    if (!el.isConnected) return; // post was unmounted (virtualized scroll)
    el.querySelector('.spotter-badge')?.remove();

    const score = Math.round(result.score);
    const demoted = result.gate < 0.999;
    const color = result.degraded
      ? '#8250df' // purple — "not a verdict", distinct from any score band
      : demoted
        ? '#8b2c2c'
        : score >= 70
          ? '#1a7f37'
          : score >= 40
            ? '#bf8700'
            : '#6e7781';

    const prefix = result.degraded ? '⚠ ' : demoted ? '▼ ' : '';

    const badge = document.createElement('div');
    badge.className = 'spotter-badge';
    badge.title = `${explain(result)}\n\nClick to rate this post.`;
    badge.textContent = `${prefix}Spotter ${score}`;
    badge.style.cssText = [
      'position: absolute',
      'top: 8px',
      'right: 8px',
      'z-index: 999',
      `background: ${color}`,
      'color: white',
      'padding: 2px 8px',
      'border-radius: 4px',
      'font: 600 11px system-ui, -apple-system, sans-serif',
      'pointer-events: auto',
      'cursor: pointer',
      'box-shadow: 0 1px 3px rgba(0,0,0,0.2)',
      demoted ? 'outline: 1px dashed rgba(255,255,255,0.7)' : ''
    ]
      .filter(Boolean)
      .join(';');
    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleRatePopover(post, el);
    });

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(badge);
  }

  // --- In-feed labeling: the eval-corpus capture path -----------------------
  // Rating a post is the explicit user action that permits capturing its raw
  // text (the one exception to the no-raw-text rule — see docs/privacy.md).
  // The question is the POLLUTION axis, not relevance: "is this engineered
  // to extract attention?" — judged on construction, not topic.

  const BUCKETS: ReadonlyArray<{ bucket: EvalBucket; label: string; value: number; bg: string }> = [
    { bucket: 'clean', label: 'Clean', value: 10, bg: '#1a7f37' },
    { bucket: 'borderline', label: 'Borderline', value: 50, bg: '#bf8700' },
    { bucket: 'pollution', label: 'Pollution', value: 90, bg: '#cf222e' }
  ];

  function toggleRatePopover(post: RawPost, postEl: HTMLElement) {
    const existing = postEl.querySelector('.spotter-rate');
    if (existing) {
      existing.remove();
      return;
    }
    document.querySelectorAll('.spotter-rate').forEach(n => n.remove()); // one at a time

    const pop = document.createElement('div');
    pop.className = 'spotter-rate';
    pop.style.cssText = [
      'position: absolute',
      'top: 32px',
      'right: 8px',
      'z-index: 1000',
      'background: #1f2328',
      'color: white',
      'padding: 8px',
      'border-radius: 6px',
      'font: 500 11px system-ui, -apple-system, sans-serif',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.35)',
      'display: flex',
      'flex-direction: column',
      'gap: 6px',
      'pointer-events: auto'
    ].join(';');

    const q = document.createElement('div');
    q.textContent = 'Attention pollution? (your judgment)';
    pop.appendChild(q);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px;';
    for (const b of BUCKETS) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.style.cssText = [
        `background: ${b.bg}`,
        'color: white',
        'border: none',
        'border-radius: 4px',
        'padding: 4px 8px',
        'font: 600 11px system-ui, -apple-system, sans-serif',
        'cursor: pointer'
      ].join(';');
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        void submitLabel(post, b.bucket, b.value, pop);
      });
      row.appendChild(btn);
    }
    pop.appendChild(row);
    postEl.appendChild(pop);
  }

  async function submitLabel(
    post: RawPost,
    bucket: EvalBucket,
    value: number,
    pop: HTMLElement
  ) {
    const entry: EvalLabelEntry = {
      postId: post.id,
      platform: post.platform,
      authorHandle: post.authorHandle,
      authorName: post.authorName,
      text: post.text,
      axis: 'pollution',
      bucket,
      value,
      labeledAt: new Date().toISOString()
    };
    const req: LabelRequest = { type: 'spotter:label', entry };
    try {
      const res = (await chrome.runtime.sendMessage(req)) as LabelResponse | undefined;
      pop.textContent = res?.ok ? `✓ saved: ${bucket}` : `✗ ${res?.error ?? 'no response'}`;
    } catch (err) {
      pop.textContent = `✗ ${err instanceof Error ? err.message : String(err)}`;
    }
    window.setTimeout(() => pop.remove(), 1200);
  }

  let reorderTimer: number | null = null;
  function scheduleReorder() {
    if (reorderTimer !== null) return;
    reorderTimer = window.setTimeout(() => {
      reorderTimer = null;
      const ids = [...scores.entries()]
        .sort((a, b) => b[1].score - a[1].score)
        .map(([id]) => id);
      if (ids.length > 0) adapter.reorder(ids);
    }, 600);
  }

  const stopObserve = adapter.observe(post => {
    seenCount++;
    console.log(`[spotter] post #${seenCount}`, {
      id: post.id,
      author: `${post.authorName} (@${post.authorHandle})`,
      media: post.mediaTypes,
      textLen: post.text.length,
      preview: post.text.slice(0, 80)
    });
    enqueue(post);
  });

  const stopEngagement = adapter.observeEngagement(event => {
    console.log('[spotter] engagement', event);
  });

  let ticks = 0;
  const tick = window.setInterval(() => {
    ticks++;
    console.log(
      `[spotter] status t+${ticks * 5}s — seen: ${seenCount}, scored: ${scores.size}, queued: ${queue.length}`
    );
    if (ticks >= 12) window.clearInterval(tick);
  }, 5000);

  window.addEventListener('beforeunload', () => {
    stopObserve();
    stopEngagement();
    window.clearInterval(tick);
  });
}
