<script lang="ts">
  import { onMount } from 'svelte';
  import { getPreferences, putPreferences } from '$lib/store/db';
  import { browserTransport } from '$lib/transport';
  import { titleOf, htmlToText, type PreferenceDoc, type ExampleLink } from '$core/index';
  import type { DigestView, DigestGetResponse, DigestRunResponse, GestureResponse } from '$shared/messages';

  /**
   * The morning surface (§5.5): a finite digest that ends, its reasons, and an
   * account of what was held back. The tier that produced it is always named —
   * a three-day-old digest presented as today's is the silent staleness this
   * project refuses everywhere else.
   */
  let view = $state<DigestView | null>(null);
  let running = $state(false);
  let error = $state<string | null>(null);
  let prefs = $state<PreferenceDoc | null>(null);

  let topicsText = $state('');
  let feedName = $state('');
  let feedUrl = $state('');
  let exampleUrl = $state('');
  let exampleVerdict = $state<'good' | 'bad'>('good');
  let exampleNote = $state('');
  let addingExample = $state(false);

  async function refresh() {
    const res = (await chrome.runtime.sendMessage({ type: 'spotter:digest-get' })) as DigestGetResponse;
    if (res.ok) {
      view = res.view;
      error = null;
    } else error = res.error;
    prefs = await getPreferences();
    topicsText = prefs.topicsMore.join(', ');
  }

  onMount(refresh);

  async function runNow() {
    running = true;
    error = null;
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'spotter:digest-run' })) as DigestRunResponse;
      if (res.ok) view = res.view;
      else error = res.error;
    } finally {
      running = false;
    }
  }

  /** Opening is not reading — the click records an open, nothing more. */
  async function openEntry(documentId: string, url: string) {
    void ((await chrome.runtime.sendMessage({ type: 'spotter:digest-open', documentId })) as GestureResponse);
    window.open(url, '_blank', 'noopener');
    await refresh();
  }

  /** The explicit gesture (§5.6.1). Never a timer, never a scroll position. */
  async function markRead(documentId: string) {
    await chrome.runtime.sendMessage({ type: 'spotter:digest-read', documentId });
    await refresh();
  }

  async function saveTopics() {
    if (!prefs) return;
    prefs.topicsMore = topicsText.split(',').map(t => t.trim()).filter(Boolean);
    prefs.updatedAt = new Date().toISOString();
    await putPreferences($state.snapshot(prefs) as PreferenceDoc);
  }

  async function addFeed() {
    if (!prefs || !feedUrl.trim()) return;
    prefs.feeds = [...(prefs.feeds ?? []), { url: feedUrl.trim(), name: feedName.trim() || hostOf(feedUrl) }];
    prefs.updatedAt = new Date().toISOString();
    await putPreferences($state.snapshot(prefs) as PreferenceDoc);
    feedName = '';
    feedUrl = '';
  }

  async function removeFeed(url: string) {
    if (!prefs) return;
    prefs.feeds = (prefs.feeds ?? []).filter(f => f.url !== url);
    await putPreferences($state.snapshot(prefs) as PreferenceDoc);
  }

  /**
   * Title and excerpt are captured once, here, at submission (see
   * `ExampleLink`): a URL alone teaches a prompt nothing, and re-fetching at
   * every scoring run would multiply egress for no new information.
   */
  async function addExample() {
    if (!prefs || !exampleUrl.trim()) return;
    addingExample = true;
    try {
      let title: string | undefined;
      let excerpt: string | undefined;
      try {
        const res = await browserTransport(exampleUrl.trim());
        if (res.ok) {
          const html = await res.text();
          title = titleOf(html) || undefined;
          excerpt = htmlToText(html).slice(0, 500) || undefined;
        }
      } catch {
        // An unreachable example still counts as taste — it just teaches less.
      }
      const link: ExampleLink = {
        url: exampleUrl.trim(),
        verdict: exampleVerdict,
        note: exampleNote.trim() || undefined,
        title,
        excerpt
      };
      prefs.examples = [...(prefs.examples ?? []), link];
      prefs.updatedAt = new Date().toISOString();
      await putPreferences($state.snapshot(prefs) as PreferenceDoc);
      exampleUrl = '';
      exampleNote = '';
    } finally {
      addingExample = false;
    }
  }

  async function removeExample(url: string) {
    if (!prefs) return;
    prefs.examples = (prefs.examples ?? []).filter(e => e.url !== url);
    await putPreferences($state.snapshot(prefs) as PreferenceDoc);
  }

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  const tierLabel = { overnight: 'overnight run', staleness: 'first interaction today', manual: 'manual run' } as const;
</script>

<section>
  <div class="digest-head">
    <h2>Today's digest</h2>
    <button onclick={runNow} disabled={running}>{running ? 'Searching…' : 'Search now'}</button>
  </div>

  {#if error}
    <p class="banner" role="alert">{error}</p>
  {/if}

  {#if view?.ranAt}
    <p class="muted">
      Produced {new Date(view.ranAt).toLocaleString()} · {tierLabel[view.ranBy ?? 'manual']}
      {#if view.counts}
        · searched {view.counts.searched} → triaged {view.counts.afterTriage} → fetched {view.counts.fetched} → scored
        {view.counts.scored}
      {/if}
    </p>
  {:else if view}
    <p class="muted">No digest yet. Declare topics below, then run one.</p>
  {/if}

  {#if view}
    {#each view.entries as e (e.documentId)}
      <article class="digest-entry" class:read={e.readAt}>
        <div class="entry-head">
          <a
            href={e.url}
            onclick={ev => {
              ev.preventDefault();
              void openEntry(e.documentId, e.url);
            }}>{e.title}</a
          >
          <span class="score">{e.score.toFixed(0)}</span>
        </div>
        {#if e.reason}<p class="reason">{e.reason}</p>{/if}
        <p class="meta">
          {e.engine}
          {#if e.scoredOn === 'abstract'}<span class="badge">scored on abstract</span>{/if}
          {#if e.degraded}<span class="badge warn">degraded</span>{/if}
          {#if e.openedAt && !e.readAt}<span class="badge">opened</span>{/if}
          {#if e.readAt}<span class="badge ok">read</span>{/if}
          {#if !e.readAt}
            <button class="small" onclick={() => markRead(e.documentId)}>Mark read</button>
          {/if}
        </p>
        <details>
          <summary>Why this ranking</summary>
          <ul>
            {#each e.axes as a (a.axis)}
              <li>
                <strong>{a.axis}</strong>
                {a.kind === 'gate' ? `×${a.score.toFixed(2)}` : a.score.toFixed(0)}
                {#if !a.ok}<em>(could not judge)</em>{/if}
                — {a.reason}
              </li>
            {/each}
          </ul>
        </details>
      </article>
    {:else}
      {#if view.ranAt}<p class="muted">A thin day: nothing earned a slot. That is the ceiling working, not a failure.</p>{/if}
    {/each}

    {#if view.heldBackLost}
      <p class="muted">
        The night's held-back detail lived in session memory and did not survive the browser restart — the digest above
        is rebuilt from the store; the rest of that run's account is gone. (Working memory, not storage: by design.)
      </p>
    {:else if view.heldBack.length}
      <details class="held">
        <summary>Held back ({view.heldBack.length}) — and why</summary>
        <ul>
          {#each view.heldBack as h (h.documentId)}
            <li>
              <a href={h.url} target="_blank" rel="noopener">{h.title}</a>
              <span class="score">{h.score.toFixed(0)}</span>
              {#if h.outcome === 'refused'}<em>refused: {h.reason}</em>
              {:else if h.outcome === 'beaten'}<em>beaten{h.margin != null ? ` by ${h.margin.toFixed(1)}` : ''}</em>
              {:else}<em>the editor returned no ruling on this one</em>{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>

<section>
  <h2>Sources</h2>
  <label>
    Topics (query seeds, comma-separated)
    <input type="text" bind:value={topicsText} onblur={saveTopics} placeholder="attention, technology criticism" />
  </label>

  <h3>Feeds (Mode B — sources you trust)</h3>
  <ul>
    {#each prefs?.feeds ?? [] as f (f.url)}
      <li>{f.name} — <span class="muted">{f.url}</span> <button class="small" onclick={() => removeFeed(f.url)}>remove</button></li>
    {/each}
  </ul>
  <div class="row">
    <input type="text" bind:value={feedName} placeholder="name" />
    <input type="text" bind:value={feedUrl} placeholder="https://…/feed.xml" />
    <button onclick={addFeed}>Add feed</button>
  </div>

  <h3>Examples (good and bad — optional, feeds Quality and Calibration)</h3>
  <ul>
    {#each prefs?.examples ?? [] as ex (ex.url)}
      <li>
        <strong>{ex.verdict}</strong> — {ex.title ?? ex.url}
        {#if ex.note}<span class="muted">({ex.note})</span>{/if}
        <button class="small" onclick={() => removeExample(ex.url)}>remove</button>
      </li>
    {/each}
  </ul>
  <div class="row">
    <select bind:value={exampleVerdict}><option value="good">good</option><option value="bad">bad</option></select>
    <input type="text" bind:value={exampleUrl} placeholder="https://…" />
    <input type="text" bind:value={exampleNote} placeholder="why (optional)" />
    <button onclick={addExample} disabled={addingExample}>{addingExample ? 'Fetching…' : 'Add example'}</button>
  </div>
</section>

<style>
  .digest-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .digest-entry {
    border: 1px solid var(--border, #ddd);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin: 0.6rem 0;
  }
  .digest-entry.read {
    opacity: 0.65;
  }
  .entry-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .entry-head a {
    font-weight: 600;
  }
  .score {
    font-variant-numeric: tabular-nums;
  }
  .reason {
    margin: 0.3rem 0;
  }
  .meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .badge {
    border: 1px solid var(--border, #bbb);
    border-radius: 4px;
    padding: 0 0.35rem;
    font-size: 0.8em;
  }
  .badge.warn {
    border-style: dashed;
  }
  .badge.ok {
    border-style: double;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  button.small {
    font-size: 0.8em;
  }
  .held {
    margin-top: 1rem;
  }
</style>
