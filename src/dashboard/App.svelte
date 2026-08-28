<script lang="ts">
  import { onMount } from 'svelte';
  import { recentConsumption, allEvalLabels, deleteEvalLabel } from '$lib/store/db';
  import type { ConsumptionLogEntry, EvalLabelEntry } from '$shared/types';
  import {
    countToday,
    averageScore,
    topTopics,
    kindBreakdown,
    topAuthors,
    scoreHistogram,
    heldBack,
    degradedEntries,
    ungatedCount
  } from './lib/aggregate';
  import Chat from './Chat.svelte';
  import Digest from './Digest.svelte';
  import Sources from './Sources.svelte';
  import { getPreferences } from '$lib/store/db';
  import { MODELS, DEFAULT_MODEL, type ProviderId } from '$core/index';
  import {
    getSettings,
    putSettings,
    settingsProblem,
    DEFAULT_SETTINGS,
    type BackendSettings
  } from '$lib/settings';

  const PROVIDERS: Array<{ id: ProviderId; label: string; note: string }> = [
    { id: 'ollama', label: 'Local (Ollama)', note: 'nothing leaves this machine' },
    { id: 'anthropic', label: 'Anthropic', note: 'your key, your account' },
    { id: 'gemini', label: 'Google Gemini', note: 'your key, your account' }
  ];

  let settings = $state<BackendSettings>({ ...DEFAULT_SETTINGS });
  const settingsIssue = $derived(settingsProblem(settings));

  async function save() {
    await putSettings($state.snapshot(settings));
    // Backend settings are half of the declarations the companion runs on —
    // reconcile it on every save, not only on the Sources button or a worker
    // wake. Without this, a budget or model changed here would sit local until
    // the next wake while the companion produced on the old value.
    void chrome.runtime.sendMessage({ type: 'spotter:declarations-changed' }).catch(() => {});
  }

  function selectProvider(id: ProviderId) {
    settings.provider = id;
    // Carry the user's model across only when it belongs to the new provider;
    // otherwise a Qwen tag would be sent to Anthropic and 404 on first scroll.
    if (!MODELS[id].some(m => m.id === settings.model)) settings.model = DEFAULT_MODEL[id];
    void save();
  }

  function setKey(value: string) {
    settings.apiKeys = { ...settings.apiKeys, [settings.provider]: value };
  }

  type Tab = 'digest' | 'overview' | 'held-back' | 'chat' | 'changelog' | 'preferences' | 'eval';

  // The digest is the product (§5.5); the feed views are the POC surface.
  let activeTab = $state<Tab>('digest');

  // Onboarding: with nothing declared, the digest has nowhere to look — so the
  // first screen is the declaration, once, and thereafter it lives in
  // Preferences (Céline, 2026-08-19). Decided once at load and dismissed by an
  // explicit gesture — flipping it live on the first topic added would swap
  // the screen out from under the person using it.
  let showOnboarding = $state<boolean | null>(null);

  async function checkOnboarding() {
    if (showOnboarding !== null) return;
    const p = await getPreferences();
    showOnboarding = !(
      (p.topicsMore?.length ?? 0) > 0 ||
      (p.feeds?.length ?? 0) > 0 ||
      (p.examples?.length ?? 0) > 0
    );
  }
  let entries = $state<ConsumptionLogEntry[]>([]);
  let labels = $state<EvalLabelEntry[]>([]);
  let loading = $state(true);

  async function refresh() {
    loading = true;
    entries = await recentConsumption(1000);
    labels = (await allEvalLabels()).sort((a, b) => b.labeledAt.localeCompare(a.labeledAt));
    settings = await getSettings();
    await checkOnboarding();
    loading = false;
  }

  onMount(refresh);

  async function removeLabel(postId: string) {
    await deleteEvalLabel(postId);
    labels = labels.filter(l => l.postId !== postId);
  }

  // Export in the exact shape eval/run.ts consumes (CorpusItem[]).
  function exportCorpus() {
    const corpus = labels.map(l => ({
      id: l.postId,
      authorName: l.authorName,
      text: l.text,
      label: { pollution: l.value },
      note: `labeled in-feed (${l.bucket}) ${l.labeledAt.slice(0, 10)}`
    }));
    const blob = new Blob([JSON.stringify(corpus, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spotter-corpus-pollution.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const bucketChip = (bucket: EvalLabelEntry['bucket']): string =>
    bucket === 'clean' ? '#1a7f37' : bucket === 'borderline' ? '#bf8700' : '#cf222e';

  const total = $derived(entries.length);
  const today = $derived(countToday(entries));
  const avg = $derived(averageScore(entries));
  const topics = $derived(topTopics(entries, 10));
  const kinds = $derived(kindBreakdown(entries));
  const authors = $derived(topAuthors(entries, 8));
  const histogram = $derived(scoreHistogram(entries));

  const held = $derived(heldBack(entries, 100));
  const degraded = $derived(degradedEntries(entries));
  const ungated = $derived(ungatedCount(entries));

  const topicMax = $derived(Math.max(1, ...topics.map(t => t.count)));
  const histMax = $derived(Math.max(1, ...histogram.map(b => b.count)));

  const timeOf = (iso: string): string =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const bucketColor = (lo: number): string => {
    if (lo >= 80) return '#22c55e'; // green
    if (lo >= 60) return '#84cc16'; // lime
    if (lo >= 40) return '#eab308'; // amber
    if (lo >= 20) return '#f97316'; // orange
    return '#94a3b8'; // slate (low but not "wrong")
  };

  const kindColor = (kind: string): string => {
    switch (kind) {
      case 'news':
        return '#0ea5e9'; // sky
      case 'promo':
        return '#f97316'; // orange
      case 'claim':
        return '#22c55e'; // green
      case 'opinion':
        return '#a855f7'; // purple
      case 'story':
        return '#f59e0b'; // amber
      default:
        return '#94a3b8'; // slate
    }
  };
</script>

<header>
  <div class="row">
    <div>
      <h1>Spotter</h1>
      <p class="tagline">Your feed, your rules.</p>
    </div>
    <button class="refresh" onclick={refresh} disabled={loading}>
      {loading ? 'Loading…' : 'Refresh'}
    </button>
  </div>
  <nav>
    <button class:active={activeTab === 'digest'} onclick={() => (activeTab = 'digest')}>
      Digest
    </button>
    <button class:active={activeTab === 'overview'} onclick={() => (activeTab = 'overview')}>
      Overview
    </button>
    <button class:active={activeTab === 'held-back'} onclick={() => (activeTab = 'held-back')}>
      Held back{held.length ? ` (${held.length})` : ''}
    </button>
    <button class:active={activeTab === 'chat'} onclick={() => (activeTab = 'chat')}>
      Chat
    </button>
    <button class:active={activeTab === 'changelog'} onclick={() => (activeTab = 'changelog')}>
      Changelog
    </button>
    <button class:active={activeTab === 'preferences'} onclick={() => (activeTab = 'preferences')}>
      Preferences
    </button>
    <button class:active={activeTab === 'eval'} onclick={() => (activeTab = 'eval')}>
      Eval {labels.length ? `(${labels.length})` : ''}
    </button>
  </nav>
</header>

<main>
  <!--
    Fail-safe, loudly. A degraded score is an absent judgment, not a low one, so
    it is announced on every tab rather than left for the curious to discover.
  -->
  {#if degraded.length > 0}
    <p class="banner" role="status">
      <strong>{degraded.length}</strong>
      {degraded.length === 1 ? 'post was' : 'posts were'} scored while an axis could not
      judge — usually the local model returning something unparseable. Those posts were
      ranked on the remaining axes, never suppressed. If this keeps happening, check that
      Ollama is running and the model is pulled.
    </p>
  {/if}

  {#if showOnboarding}
    <section>
      <h2>Welcome — tell Spotter where to look</h2>
      <p class="muted">
        The digest searches what you declare here: topics, trusted feeds, and (optionally) links you rate as good or
        bad examples. All of it stays editable later, under Preferences.
      </p>
    </section>
    <Sources />
    <section>
      <button
        onclick={() => {
          showOnboarding = false;
          activeTab = 'digest';
        }}>Open my digest</button
      >
    </section>
  {:else if activeTab === 'digest'}
    <Digest />
  {:else if activeTab === 'overview'}
    {#if loading}
      <p class="muted">Loading your consumption log…</p>
    {:else if entries.length === 0}
      <section>
        <h2>No data yet</h2>
        <p class="muted">
          Open LinkedIn with Spotter installed. As posts are seen and scored, they'll
          be summarized in the background and appear here.
        </p>
      </section>
    {:else}
      <section class="hero">
        <div class="stat">
          <div class="stat-value">{total}</div>
          <div class="stat-label">posts seen</div>
        </div>
        <div class="stat">
          <div class="stat-value">{today}</div>
          <div class="stat-label">today</div>
        </div>
        <div class="stat">
          <div class="stat-value">{avg.toFixed(0)}</div>
          <div class="stat-label">avg score</div>
        </div>
      </section>

      <section>
        <h2>Top topics</h2>
        {#if topics.length === 0}
          <p class="muted">No topics tagged yet. (Analyst model still warming up.)</p>
        {:else}
          <ul class="bars">
            {#each topics as t (t.topic)}
              <li>
                <span class="bar-label">{t.topic}</span>
                <span class="bar bar-accent" style="width: {(t.count / topicMax) * 100}%"></span>
                <span class="bar-count">{t.count}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section>
        <h2>Score distribution</h2>
        <ul class="bars hist">
          {#each histogram as b (b.bucket)}
            <li>
              <span class="bar-label">{b.bucket}</span>
              <span
                class="bar"
                style="width: {(b.count / histMax) * 100}%; background-color: {bucketColor(b.lo)};"
              ></span>
              <span class="bar-count">{b.count}</span>
            </li>
          {/each}
        </ul>
      </section>

      <section class="two-col">
        <div>
          <h2>Post kinds</h2>
          {#if kinds.length === 0}
            <p class="muted">—</p>
          {:else}
            <ul class="kinds">
              {#each kinds as k (k.kind)}
                <li>
                  <span
                    class="kind-chip"
                    style="background-color: {kindColor(k.kind)};"
                    aria-hidden="true"
                  ></span>
                  <span class="kind-label">{k.kind}</span>
                  <span class="kind-count">{k.count}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div>
          <h2>Top authors</h2>
          {#if authors.length === 0}
            <p class="muted">—</p>
          {:else}
            <ul class="authors">
              {#each authors as a (a.handle)}
                <li>
                  <span class="author-handle">{a.handle}</span>
                  <span class="author-count">{a.count}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </section>
    {/if}
  {:else if activeTab === 'held-back'}
    <section>
      <h2>Held back</h2>
      <p class="muted intro">
        Spotter never hides a post — it reorders. <em>Held back</em> therefore means
        <em>pushed down</em>: these are the posts a gate axis demoted, what they were worth
        before, and which gate did it. Everything here is still in your feed, further down.
      </p>

      {#if ungated > 0}
        <p class="muted note">
          {ungated} older {ungated === 1 ? 'entry predates' : 'entries predate'} the gate axes
          and carry no composition detail, so they can't appear here either way.
        </p>
      {/if}

      {#if held.length === 0}
        <p class="muted">
          Nothing has been demoted yet. Either your feed is unusually clean, or no post has
          been scored since the gate axes were wired.
        </p>
      {:else}
        <ul class="held">
          {#each held as h (h.postId)}
            <li>
              <div class="held-head">
                <span class="held-author">{h.authorHandle || 'unknown author'}</span>
                <span class="held-time">{timeOf(h.seenAt)}</span>
              </div>
              <div class="held-arith">
                <span class="sr-only">
                  demoted from {Math.round(h.before)} to {Math.round(h.after)}, gate
                  {h.gate.toFixed(2)}
                </span>
                <span class="held-before" aria-hidden="true">{Math.round(h.before)}</span>
                <span class="held-arrow" aria-hidden="true">→</span>
                <span class="held-after" aria-hidden="true">{Math.round(h.after)}</span>
                <span class="held-gate" aria-hidden="true">×{h.gate.toFixed(2)}</span>
              </div>
              <ul class="held-why">
                {#each h.demotedBy as a (a.axis)}
                  <li><strong>{a.axis}</strong> — {a.reason}</li>
                {/each}
              </ul>
              {#if h.topics.length > 0}
                <div class="held-topics">
                  {#each h.topics.slice(0, 5) as t (t)}<span class="topic-chip">{t}</span>{/each}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {:else if activeTab === 'chat'}
    <Chat />
  {:else if activeTab === 'changelog'}
    <section>
      <h2>Model changelog</h2>
      <p class="muted">
        Nothing has been learned implicitly yet. When the system notices patterns
        in your behavior, it will propose changes here for your approval.
      </p>
    </section>
  {:else if activeTab === 'preferences'}
    <Sources />
    <section>
      <h2>Model backend</h2>
      <p class="muted intro">
        Which model judges your feed. <strong>Local is the default and stays the
        default</strong> — nothing leaves this machine. Choosing a cloud provider sends each
        post's text, and your topic preferences, to that company under your own API key.
        That is a real trade, and it is yours to make: the eval harness is there to tell
        you what it buys you before you make it.
      </p>

      <div class="field">
        <span class="field-label" id="provider-label">Provider</span>
        <div class="radios" role="radiogroup" aria-labelledby="provider-label">
          {#each PROVIDERS as p (p.id)}
            <label class="radio">
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={settings.provider === p.id}
                onchange={() => selectProvider(p.id)}
              />
              <span>{p.label}</span>
              <span class="radio-note">{p.note}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="model">Model</label>
        <input
          id="model"
          list="model-options"
          bind:value={settings.model}
          onchange={save}
          placeholder="model id"
        />
        <datalist id="model-options">
          {#each MODELS[settings.provider] as m (m.id)}
            <option value={m.id}>{m.label}{m.note ? ` — ${m.note}` : ''}</option>
          {/each}
        </datalist>
        <p class="field-help">
          Pick from the list or type any id your backend serves.
        </p>
      </div>

      {#if settings.provider === 'ollama'}
        <div class="field">
          <label class="field-label" for="host">Ollama host</label>
          <input id="host" bind:value={settings.ollamaHost} onchange={save} />
        </div>
      {:else}
        <div class="field">
          <label class="field-label" for="apikey">
            API key for {settings.provider}
          </label>
          <input
            id="apikey"
            type="password"
            value={settings.apiKeys[settings.provider] ?? ''}
            oninput={e => setKey((e.currentTarget as HTMLInputElement).value)}
            onchange={save}
            placeholder="your own key"
            autocomplete="off"
          />
          <p class="field-help">
            Stored on this device only, never synced through your browser account, and
            sent only to {settings.provider}. Keys for other providers are kept separately,
            so switching back doesn't lose them.
          </p>
        </div>
      {/if}
      <div class="field">
        <label class="field-label" for="searxng">SearXNG instance (digest search)</label>
        <input
          id="searxng"
          bind:value={settings.searxngUrl}
          onchange={save}
          placeholder="http://localhost:8888"
        />
        <p class="field-help">
          Your own meta-search instance — the self-hosted substrate the digest queries.
          It needs JSON output enabled (<code>search.formats</code> in its settings.yml).
        </p>
      </div>
      <div class="field">
        <label class="field-label" for="fetch-budget">Search depth — candidates examined per funnel</label>
        <input
          id="fetch-budget"
          type="number"
          min="1"
          max="200"
          bind:value={settings.fetchBudget}
          onchange={save}
          placeholder="20"
        />
        <p class="field-help">
          Each search (one topic × one engine) keeps this many results, in the engine's own ranking
          order; each one kept costs a page fetch plus a judgment on every axis, so the run's duration
          grows roughly linearly with this number. What falls beyond it is dropped from the tail and
          reported as <em>over-budget</em> in the funnel — never silently. Default 20.
        </p>
      </div>
      <div class="field">
        <label class="field-label" for="companion-url">Companion (optional)</label>
        <input
          id="companion-url"
          bind:value={settings.companionUrl}
          onchange={save}
          placeholder="http://localhost:8787"
        />
        <input
          id="companion-token"
          type="password"
          bind:value={settings.companionToken}
          onchange={save}
          placeholder="pairing token (printed at companion startup)"
          autocomplete="off"
        />
        <p class="field-help">
          A local process (<code>npm run companion</code>) that produces the digest at night
          with the browser closed, and serves it to this dashboard and to your phone on the
          LAN. When paired and running, it produces; this extension steps back to reading.
          The Digest tab says which one served.
        </p>
      </div>

      {#if settingsIssue}
        <p class="banner" role="status">{settingsIssue}</p>
      {:else}
        <p class="muted">
          Scoring with <strong>{settings.model}</strong> via {settings.provider}.
          {#if settings.provider !== 'ollama'}
            Summaries and chat still run locally — they see the full post text, which is
            the most intimate thing here.
          {/if}
        </p>
      {/if}
    </section>

    <section>
      <h2>Preference document</h2>
      <p class="muted">Preference editor — coming in the next iteration.</p>
    </section>
  {:else}
    <section>
      <div class="eval-head">
        <h2>Eval corpus — pollution axis</h2>
        <button class="refresh" onclick={exportCorpus} disabled={labels.length === 0}>
          Export JSON
        </button>
      </div>
      <p class="muted">
        Rate posts in the feed (click a Spotter badge) to build your labeled corpus.
        These entries store raw post text — captured only when you rate, deletable here,
        never leaving this machine. ~30–50 labels across the range make a useful first run:
        export, save as <code>eval/corpus/mine.json</code>, then
        <code>npm run eval -- --corpus=eval/corpus/mine.json</code>.
      </p>
      {#if labels.length === 0}
        <p class="muted">No labels yet.</p>
      {:else}
        <ul class="labels">
          {#each labels as l (l.postId)}
            <li>
              <span class="label-chip" style="background-color: {bucketChip(l.bucket)};"
                >{l.bucket}</span
              >
              <span class="label-author">{l.authorName || l.authorHandle || '—'}</span>
              <span class="label-text">{l.text.slice(0, 110)}{l.text.length > 110 ? '…' : ''}</span>
              <button class="label-delete" title="Delete label" onclick={() => removeLabel(l.postId)}
                >✕</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  :global(:root) {
    --spotter-accent: #6366f1; /* indigo — calm, distinct from platform chrome */
    --spotter-accent-soft: color-mix(in srgb, var(--spotter-accent) 18%, transparent);
  }

  header {
    padding: 1.25rem 1.5rem 0.75rem;
    border-bottom: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--spotter-accent);
  }
  .tagline {
    margin: 0.25rem 0 0.75rem;
    color: color-mix(in srgb, CanvasText 60%, transparent);
    font-size: 0.9rem;
  }
  .refresh {
    padding: 0.4rem 0.9rem;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    background: transparent;
    color: inherit;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
  .refresh:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  nav {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  nav button {
    padding: 0.4rem 0.8rem;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    background: transparent;
    color: inherit;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }
  nav button.active {
    background: var(--spotter-accent-soft);
    border-color: color-mix(in srgb, var(--spotter-accent) 50%, transparent);
    color: var(--spotter-accent);
  }
  main {
    padding: 1.5rem;
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  section {
    margin: 0;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    color: color-mix(in srgb, CanvasText 85%, transparent);
  }
  .muted {
    color: color-mix(in srgb, CanvasText 60%, transparent);
  }

  .hero {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
  .stat {
    padding: 1rem;
    border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
    border-radius: 8px;
    text-align: center;
    background: linear-gradient(
      180deg,
      var(--spotter-accent-soft) 0%,
      transparent 100%
    );
  }
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    color: var(--spotter-accent);
  }
  .stat-label {
    margin-top: 0.25rem;
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 60%, transparent);
  }

  .bars {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .bars li {
    display: grid;
    grid-template-columns: 10rem 1fr 2.5rem;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
  }
  .bars.hist li {
    grid-template-columns: 4rem 1fr 2.5rem;
  }
  .bar-label {
    text-transform: lowercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar {
    height: 14px;
    background: color-mix(in srgb, CanvasText 40%, transparent);
    border-radius: 3px;
    display: inline-block;
    min-width: 2px;
  }
  .bar-accent {
    background: linear-gradient(
      90deg,
      var(--spotter-accent) 0%,
      color-mix(in srgb, var(--spotter-accent) 60%, transparent) 100%
    );
  }
  .bar-count {
    text-align: right;
    color: color-mix(in srgb, CanvasText 70%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
  .kinds,
  .authors {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.9rem;
  }
  .kinds li,
  .authors li {
    display: flex;
    justify-content: space-between;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px dashed color-mix(in srgb, CanvasText 12%, transparent);
    gap: 0.5rem;
  }
  .kinds li {
    align-items: center;
  }
  .kind-chip {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .kind-label {
    flex: 1;
    text-transform: lowercase;
  }
  .author-handle {
    text-transform: lowercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind-count,
  .author-count {
    color: color-mix(in srgb, CanvasText 60%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .eval-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  .eval-head h2 {
    margin: 0;
  }
  .labels {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.9rem;
  }
  .labels li {
    display: grid;
    grid-template-columns: 6rem 10rem 1fr 2rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px dashed color-mix(in srgb, CanvasText 12%, transparent);
  }
  .label-chip {
    color: white;
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }
  .label-author {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label-text {
    color: color-mix(in srgb, CanvasText 65%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label-delete {
    border: none;
    background: transparent;
    color: color-mix(in srgb, CanvasText 50%, transparent);
    cursor: pointer;
    font: inherit;
  }
  .label-delete:hover {
    color: #cf222e;
  }

  .field {
    margin-bottom: 1.25rem;
    max-width: 42rem;
  }
  .field-label {
    display: block;
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.4rem;
  }
  .field input {
    width: 100%;
    padding: 0.45rem 0.6rem;
    border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  .field input:focus-visible {
    outline: 2px solid var(--spotter-accent);
    outline-offset: 1px;
  }
  .field-help {
    margin: 0.35rem 0 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: color-mix(in srgb, CanvasText 62%, transparent);
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .radio {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .radio:hover {
    background: color-mix(in srgb, CanvasText 6%, transparent);
  }
  .radio:has(input:focus-visible) {
    outline: 2px solid var(--spotter-accent);
    outline-offset: 1px;
  }
  .radio input {
    accent-color: var(--spotter-accent);
  }
  .radio-note {
    font-size: 0.82rem;
    color: color-mix(in srgb, CanvasText 60%, transparent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .banner {
    margin: 0;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in srgb, #8250df 55%, transparent);
    border-left-width: 4px;
    border-radius: 6px;
    background: color-mix(in srgb, #8250df 12%, transparent);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .intro {
    margin: -0.25rem 0 1rem;
    font-size: 0.9rem;
    line-height: 1.5;
    max-width: 62ch;
  }
  .note {
    margin: 0 0 1rem;
    font-size: 0.85rem;
  }

  .held {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .held > li {
    padding: 0.75rem 0.9rem;
    border: 1px solid color-mix(in srgb, CanvasText 15%, transparent);
    border-left: 4px solid color-mix(in srgb, #b3261e 70%, transparent);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .held-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
  }
  .held-author {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .held-time {
    color: color-mix(in srgb, CanvasText 60%, transparent);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .held-arith {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
  }
  .held-before {
    color: color-mix(in srgb, CanvasText 60%, transparent);
    text-decoration: line-through;
  }
  .held-arrow {
    color: color-mix(in srgb, CanvasText 45%, transparent);
  }
  .held-after {
    font-size: 1.25rem;
    font-weight: 700;
  }
  .held-gate {
    margin-left: auto;
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 65%, transparent);
  }
  .held-why {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.88rem;
    line-height: 1.45;
  }
  .held-topics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .topic-chip {
    font-size: 0.75rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, CanvasText 10%, transparent);
    color: color-mix(in srgb, CanvasText 75%, transparent);
  }

  @media (max-width: 640px) {
    .hero {
      grid-template-columns: 1fr;
    }
    .two-col {
      grid-template-columns: 1fr;
    }
    .bars li {
      grid-template-columns: 8rem 1fr 2.5rem;
    }
  }
</style>
