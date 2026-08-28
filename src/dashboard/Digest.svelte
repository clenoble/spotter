<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    DigestView,
    DigestGetResponse,
    DigestRunResponse,
    DigestCancelResponse,
    DigestDaysResponse,
    GestureResponse
  } from '$shared/messages';

  /**
   * The morning surface, and only that (Céline, 2026-08-19): the digest,
   * **historicised** — yesterday's, or a few days back, stays consultable.
   * Sources moved to Preferences; onboarding is its own screen.
   *
   * The funnel is visible whole, motivation as fine as the examination that
   * produced it: a triage rule names itself; below the cut the weakest axis
   * speaks, with the margin; the editor's own sentence covers the final sort.
   * Past days rebuild from the store (durable); the run report — held back,
   * funnel, editor reasons — is session memory, and the view says when it is
   * gone rather than pretending the night held nothing back.
   */
  let view = $state<DigestView | null>(null);
  let days = $state<string[]>([]);
  let selectedDay = $state<string | null>(null);
  let error = $state<string | null>(null);

  // The witness comes from the worker, not from this page's click: a run
  // launched here keeps running when the page closes, a tier run was never
  // launched here at all, and both must be visible. While one is live, poll.
  const busy = $derived(view?.runInProgress != null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (busy && !pollTimer) {
      pollTimer = setInterval(() => void refresh(), 5000);
    } else if (!busy && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    return () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
  });

  async function refresh() {
    const daysRes = (await chrome.runtime.sendMessage({ type: 'spotter:digest-days' })) as DigestDaysResponse;
    if (daysRes.ok) days = daysRes.days;
    const res = selectedDay
      ? ((await chrome.runtime.sendMessage({ type: 'spotter:digest-day', day: selectedDay })) as DigestGetResponse)
      : ((await chrome.runtime.sendMessage({ type: 'spotter:digest-get' })) as DigestGetResponse);
    if (res.ok) {
      view = res.view;
      error = null;
    } else error = res.error;
  }

  onMount(refresh);

  async function pickDay(day: string | null) {
    selectedDay = day;
    await refresh();
  }

  async function runNow() {
    error = null;
    const res = (await chrome.runtime.sendMessage({ type: 'spotter:digest-run' })) as DigestRunResponse;
    if (res.ok) {
      selectedDay = null;
      view = res.view; // carries runInProgress — the poll takes over from here
    } else error = res.error;
  }

  let stopping = $state(false);

  /** The other half of the control. The run stops at its next candidate. */
  async function stopRun() {
    stopping = true;
    const res = (await chrome.runtime.sendMessage({ type: 'spotter:digest-cancel' })) as DigestCancelResponse;
    if (!res.ok) {
      error = res.error;
      stopping = false;
    } else if (!res.cancelling) {
      stopping = false; // nothing was live — the next refresh will say so
    }
    await refresh();
  }

  $effect(() => {
    if (!busy) stopping = false;
  });

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

  const tierLabel = { overnight: 'overnight run', staleness: 'first interaction today', manual: 'manual run' } as const;

  function triageGroups(triaged: Array<{ url: string; title: string; reason: string }>) {
    const groups = new Map<string, Array<{ url: string; title: string }>>();
    for (const t of triaged) {
      if (!groups.has(t.reason)) groups.set(t.reason, []);
      groups.get(t.reason)!.push(t);
    }
    return [...groups.entries()];
  }
</script>

<section>
  <div class="digest-head">
    <h2>Digest</h2>
    <div class="row">
      {#if days.length > 1 || (days.length === 1 && selectedDay)}
        <select
          value={selectedDay ?? ''}
          onchange={e => pickDay((e.currentTarget as HTMLSelectElement).value || null)}
        >
          <option value="">latest</option>
          {#each days as d (d)}
            <option value={d}>{d}</option>
          {/each}
        </select>
      {/if}
      <button onclick={runNow} disabled={busy}>{busy ? 'Searching…' : 'Search now'}</button>
    </div>
  </div>

  {#if error}
    <p class="banner" role="alert">{error}</p>
  {/if}

  {#if view?.lastRunError && !view?.runInProgress}
    <p class="banner" role="alert">
      The last search ({view.lastRunError.tier}, {new Date(view.lastRunError.at).toLocaleTimeString()}) failed:
      <strong>{view.lastRunError.message}</strong>
    </p>
  {/if}

  {#if view?.runInProgress}
    <p class="banner running" role="status">
      <span class="spinner" aria-hidden="true"></span>
      Search in progress since {new Date(view.runInProgress.startedAt).toLocaleTimeString()}
      ({tierLabel[view.runInProgress.tier]}) — six axes on a local model take a while. The digest will
      appear here; you can close this page, the search continues in the background.
      <button class="small" onclick={stopRun} disabled={stopping}>
        {stopping ? 'Stopping at the next candidate…' : 'Stop this run'}
      </button>
    </p>
  {/if}

  {#if view?.ranAt}
    <p class="muted">
      Produced {new Date(view.ranAt).toLocaleString()} · {tierLabel[view.ranBy ?? 'manual']}
      {#if view.servedBy}· served by the {view.servedBy}{/if}
      {#if view.counts}
        · searched {view.counts.searched} → triaged {view.counts.afterTriage} → fetched {view.counts.fetched} → scored
        {view.counts.scored}
      {/if}
    </p>
  {:else if view && selectedDay}
    <p class="muted">Digest of {selectedDay}, rebuilt from the store. Its run detail lived in that day's session.</p>
  {:else if view}
    <p class="muted">No digest yet. Declare topics in Preferences, then run one.</p>
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
      {#if view.ranAt || selectedDay}<p class="muted">A thin day: nothing earned a slot. That is the ceiling working, not a failure.</p>{/if}
    {/each}

    {#if view.heldBackLost}
      <p class="muted">
        The run's held-back detail lived in session memory and did not survive the browser restart — the digest above is
        rebuilt from the store; the rest of that run's account is gone. (Working memory, not storage: by design.)
      </p>
    {/if}

    <!--
      The whole funnel, coarse to fine (Céline, 2026-08-19). Order mirrors the
      pipeline: mechanical triage → unreadable → below the cut (weakest axis +
      margin) → the editor's own sentences. The Crabe reliability stage is
      declared absent rather than silently missing.
    -->
    {#if view.heldBack.length}
      <details class="stage" open>
        <summary>Final sort — the editor's rulings ({view.heldBack.length})</summary>
        <ul>
          <!-- Projection lists below are deliberately unkeyed: they are replaced
               wholesale on every refresh, and a keyed each dies on a duplicate
               key — which is exactly how the digest vanished on 2026-08-19 when
               two substrates reported the same URL. The data is deduped at the
               source too; this is the second wall. -->
          {#each view.heldBack as h}
            <li>
              <a href={h.url} target="_blank" rel="noopener">{h.title}</a>
              <span class="score">{h.score.toFixed(0)}</span>
              {#if h.outcome === 'refused'}<em>refused: {h.reason}</em>
              {:else if h.outcome === 'beaten'}<em>beaten{h.margin != null ? ` by ${h.margin.toFixed(1)}` : ''} — displaced by better company, not declined</em>
              {:else}<em>unruled — the ruling call itself failed; recorded rather than invented</em>{/if}
            </li>
          {/each}
        </ul>
      </details>
    {/if}

    {#if view.funnel?.failedFunnels?.length}
      <p class="banner" role="alert">
        {#each [...new Set(view.funnel.failedFunnels.map(f => f.engine))] as engine (engine)}
          <span><strong>{engine}</strong> failed this run — its candidates are simply missing, which no count below
            can show. ({view.funnel.failedFunnels.find(f => f.engine === engine)?.error.slice(0, 100)})</span>
        {/each}
      </p>
    {/if}

    {#if view.funnel}
      <details class="stage">
        <summary>Below the funnel's cut ({view.funnel.belowCut.length}) — weakest axis, and how narrowly</summary>
        <ul>
          {#each view.funnel.belowCut as b}
            <li>
              <a href={b.url} target="_blank" rel="noopener">{b.title}</a>
              <span class="score">{b.score.toFixed(0)}</span>
              {#if b.margin != null}<span class="muted">margin {b.margin.toFixed(1)}</span>{/if}
              {#if b.weakestAxis}
                <em>{b.weakestAxis.axis} {b.weakestAxis.kind === 'gate' ? `×${b.weakestAxis.score.toFixed(2)}` : b.weakestAxis.score.toFixed(0)} — {b.weakestAxis.reason}</em>
              {/if}
            </li>
          {/each}
        </ul>
        <p class="muted">Reliability stage (Crabe): {view.funnel.crabeStage}.</p>
      </details>

      {#if view.funnel.unreadable.length}
        <details class="stage">
          <summary>Could not be read ({view.funnel.unreadable.length})</summary>
          <ul>
            {#each view.funnel.unreadable as u}
              <li class="muted">{u}</li>
            {/each}
          </ul>
        </details>
      {/if}

      {#if view.funnel.triaged.length}
        <details class="stage">
          <summary>Dropped by rule, before any judgment ({view.funnel.triaged.length})</summary>
          {#each triageGroups(view.funnel.triaged) as [reason, items] (reason)}
            <p><strong>{reason}</strong> ({items.length})</p>
            <ul>
              {#each items.slice(0, 12) as t}
                <li class="muted">{t.title || t.url}</li>
              {/each}
              {#if items.length > 12}<li class="muted">… and {items.length - 12} more</li>{/if}
            </ul>
          {/each}
        </details>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .digest-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .row {
    display: flex;
    gap: 0.5rem;
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
  button.small {
    font-size: 0.8em;
  }
  .stage {
    margin-top: 0.8rem;
  }
  .banner.running {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  .spinner {
    width: 0.9em;
    height: 0.9em;
    flex: none;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
