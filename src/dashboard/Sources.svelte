<script lang="ts">
  import { onMount } from 'svelte';
  import { getPreferences, putPreferences } from '$lib/store/db';
  import { browserTransport } from '$lib/transport';
  import { titleOf, htmlToText, type PreferenceDoc, type ExampleLink } from '$core/index';

  /**
   * Topics, feeds and examples — the whole of the v0.1 onboarding shape
   * (Céline, 2026-08-10), shown once as an onboarding screen and thereafter
   * housed in Preferences (Céline, 2026-08-19).
   *
   * §5.3's anchoring caution is a design constraint here, not a comment:
   * suggesting topics is not eliciting them, so the checkbox list is broad,
   * visibly incomplete, and the free field is placed *first* — the user's own
   * words are the primary gesture, the list is the fallback.
   */
  let { onchanged }: { onchanged?: () => void } = $props();

  let prefs = $state<PreferenceDoc | null>(null);
  let topicInput = $state('');
  let feedName = $state('');
  let feedUrl = $state('');
  let exampleUrl = $state('');
  let exampleVerdict = $state<'good' | 'bad'>('good');
  let exampleNote = $state('');
  let addingExample = $state(false);

  // Broad on purpose, and no list is complete: the field above outranks it.
  const SUGGESTED = [
    'AI research',
    'technology & society',
    'climate & energy',
    'economics',
    'geopolitics',
    'philosophy',
    'cognitive science',
    'health & medicine',
    'privacy & surveillance',
    'democracy & institutions',
    'urbanism',
    'education',
    'art & culture',
    'open source',
    'science policy',
    'media & attention'
  ];

  onMount(async () => {
    prefs = await getPreferences();
  });

  // Edits accumulate locally; nothing persists or travels until the explicit
  // button (Céline, 2026-08-19 — one gesture that saves AND pushes, with its
  // result shown; auto-save-per-toggle pushed nothing visibly and she could
  // not tell whether the companion had received anything).
  let dirty = $state(false);
  let saveStatus = $state<string | null>(null);

  function touch() {
    dirty = true;
    saveStatus = null;
  }

  async function saveAndPush() {
    if (!prefs) return;
    prefs.updatedAt = new Date().toISOString();
    await putPreferences($state.snapshot(prefs) as PreferenceDoc);
    dirty = false;
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'spotter:declarations-changed' })) as
        | { ok: true; pushed: boolean; detail: string }
        | { ok: false; error: string };
      saveStatus = res.ok ? `Saved locally · ${res.detail}` : `Saved locally · push failed: ${res.error}`;
    } catch {
      saveStatus = 'Saved locally · could not reach the background worker';
    }
    onchanged?.();
  }

  function hasTopic(t: string): boolean {
    return (prefs?.topicsMore ?? []).some(x => x.toLowerCase() === t.toLowerCase());
  }

  async function toggleTopic(t: string) {
    if (!prefs) return;
    prefs.topicsMore = hasTopic(t)
      ? prefs.topicsMore.filter(x => x.toLowerCase() !== t.toLowerCase())
      : [...prefs.topicsMore, t];
    touch();
  }

  async function addFreeTopic() {
    if (!prefs) return;
    const t = topicInput.trim();
    if (!t || hasTopic(t)) return;
    prefs.topicsMore = [...prefs.topicsMore, t];
    topicInput = '';
    touch();
  }

  async function addFeed() {
    if (!prefs || !feedUrl.trim()) return;
    prefs.feeds = [...(prefs.feeds ?? []), { url: feedUrl.trim(), name: feedName.trim() || hostOf(feedUrl) }];
    feedName = '';
    feedUrl = '';
    touch();
  }

  async function removeFeed(url: string) {
    if (!prefs) return;
    prefs.feeds = (prefs.feeds ?? []).filter(f => f.url !== url);
    touch();
  }

  /** Title + excerpt captured once, at submission — see `ExampleLink`. */
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
      exampleUrl = '';
      exampleNote = '';
      touch();
    } finally {
      addingExample = false;
    }
  }

  async function removeExample(url: string) {
    if (!prefs) return;
    prefs.examples = (prefs.examples ?? []).filter(e => e.url !== url);
    touch();
  }

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
</script>

{#if prefs}
  <section class="savebar">
    <button class="primary" onclick={saveAndPush} disabled={!dirty}>
      {dirty ? 'Save changes' : 'Saved'}
    </button>
    {#if dirty}<span class="muted">unsaved changes — nothing persists or reaches the companion until you save</span>{/if}
    {#if saveStatus}<span class="muted" role="status">{saveStatus}</span>{/if}
  </section>

  <section>
    <h3>Topics — where the digest looks</h3>
    <p class="muted">Your own words beat any list. Write a topic as you would say it:</p>
    <div class="row">
      <input
        type="text"
        bind:value={topicInput}
        placeholder="e.g. attention economy critique"
        onkeydown={e => e.key === 'Enter' && addFreeTopic()}
      />
      <button onclick={addFreeTopic}>Add topic</button>
    </div>

    {#if prefs.topicsMore.length}
      <ul class="chips">
        {#each prefs.topicsMore as t (t)}
          <li>
            {t}
            <button class="small" title="remove" onclick={() => toggleTopic(t)}>×</button>
          </li>
        {/each}
      </ul>
    {/if}

    <p class="muted">Or pick from a starter list — broad, and nowhere near complete:</p>
    <div class="grid">
      {#each SUGGESTED as t (t)}
        <label class="check">
          <input type="checkbox" checked={hasTopic(t)} onchange={() => toggleTopic(t)} />
          {t}
        </label>
      {/each}
    </div>
  </section>

  <section>
    <h3>Feeds — sources you trust (Mode B)</h3>
    <p class="muted">
      Read whole, not searched. Often the best signal-to-noise in the system — and the editorial pass still filters
      them rather than waving them through.
    </p>
    <ul>
      {#each prefs.feeds ?? [] as f (f.url)}
        <li>{f.name} — <span class="muted">{f.url}</span> <button class="small" onclick={() => removeFeed(f.url)}>remove</button></li>
      {/each}
    </ul>
    <div class="row">
      <input type="text" bind:value={feedName} placeholder="name" />
      <input type="text" bind:value={feedUrl} placeholder="https://…/feed.xml" />
      <button onclick={addFeed}>Add feed</button>
    </div>
  </section>

  <section>
    <h3>Examples — good and bad (optional)</h3>
    <p class="muted">
      Links you rate teach Quality your bar and Calibration your altitude. Without any, Quality uses a generic bar and
      Calibration does not run.
    </p>
    <ul>
      {#each prefs.examples ?? [] as ex (ex.url)}
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
{/if}

<style>
  .row {
    display: flex;
    gap: 0.5rem;
    margin: 0.4rem 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.25rem 0.75rem;
  }
  .check {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    padding: 0;
  }
  .chips li {
    border: 1px solid var(--border, #bbb);
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
  }
  button.small {
    font-size: 0.8em;
  }
  .savebar {
    display: flex;
    gap: 0.7rem;
    align-items: center;
    flex-wrap: wrap;
    position: sticky;
    top: 0;
  }
</style>
