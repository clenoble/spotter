/**
 * The phone reader — a single self-contained page the companion serves at `/`.
 *
 * Form 2 (Céline, 2026-08-19): the companion produces at night, everything
 * pulls. This page is the phone's pull: opened on the LAN in the morning, it
 * loads the digest and **eagerly caches the article texts** (the 3-day reading
 * cache, mirrored into localStorage), so the train ride reads from the phone
 * itself. Gestures (open, read) queue offline and flush when the companion is
 * reachable again.
 *
 * ## The offline boundary, stated exactly
 *
 * A real installable offline app needs a service worker, and a service worker
 * needs a secure context — HTTPS on the LAN, which needs a certificate the
 * phone trusts. That cost is deferred (docs/decisions-v0.1.md §18). Until
 * then the honest form is this: **the page works offline as long as the tab
 * lives**, plus whatever localStorage kept if it is reopened. No pretense of
 * more.
 *
 * Vanilla HTML/JS on purpose: one exported string keeps the companion
 * self-contained for the single-exe build (esbuild + Node SEA) — no second
 * bundler target, no asset pipeline. The token is entered once and kept in
 * localStorage — same trust boundary as the browser profile, stated.
 */
export const READER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#6366f1">
<title>Spotter</title>
<style>
  :root { --accent: #6366f1; --bg: #ffffff; --fg: #1a1a2e; --muted: #666a7a; --border: #d8dae5; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14141f; --fg: #e8e8f0; --muted: #9a9db0; --border: #34364a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 system-ui, sans-serif; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem;
           padding: 0.9rem 1rem 0.5rem; border-bottom: 1px solid var(--border); }
  h1 { margin: 0; font-size: 1.15rem; color: var(--accent); }
  main { padding: 0.75rem 1rem 3rem; max-width: 42rem; margin: 0 auto; }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .card { border: 1px solid var(--border); border-radius: 10px; padding: 0.8rem 1rem; margin: 0.7rem 0; }
  .card.read { opacity: 0.6; }
  .card h2 { margin: 0 0 0.3rem; font-size: 1rem; }
  .card h2 a { color: var(--fg); text-decoration: none; }
  .card h2 a:focus-visible, a:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px; }
  .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .score { font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 700; }
  .badge { border: 1px solid var(--border); border-radius: 4px; padding: 0 0.35rem; font-size: 0.75rem; }
  .reason { margin: 0.25rem 0 0.4rem; font-size: 0.9rem; }
  button, select { font: inherit; color: inherit; background: transparent; border: 1px solid var(--border);
                   border-radius: 6px; padding: 0.35rem 0.7rem; cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .banner { border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 6px;
            padding: 0.6rem 0.8rem; margin: 0.7rem 0; font-size: 0.9rem; }
  article.reading p { margin: 0 0 0.9em; }
  .back { margin: 0.5rem 0 1rem; }
  form.token { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 2rem; }
  form.token input { font: inherit; color: inherit; background: transparent; border: 1px solid var(--border);
                     border-radius: 6px; padding: 0.5rem 0.7rem; }
  label { font-weight: 600; font-size: 0.9rem; }
</style>
</head>
<body>
<header>
  <h1>Spotter</h1>
  <div class="row">
    <select id="day" aria-label="Digest day" hidden></select>
    <span id="status" class="muted" role="status"></span>
  </div>
</header>
<main id="main" aria-live="polite"></main>
<script>
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CACHE_DAYS = 3;
  const store = {
    get token() { return localStorage.getItem('spotter-token') || ''; },
    set token(v) { localStorage.setItem('spotter-token', v); },
    read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full: reading still works */ } }
  };

  // --- transport: same origin, bearer token, short timeouts -----------------
  async function api(path, init) {
    const res = await fetch(path, Object.assign({
      headers: Object.assign({ Authorization: 'Bearer ' + store.token }, (init && init.headers) || {}),
      signal: AbortSignal.timeout(10000)
    }, init));
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) throw new Error('companion ' + res.status);
    return res.json();
  }

  // --- offline mirror: digest per day + article texts, purged past 3 days ---
  function purge(map) {
    const floor = new Date(Date.now() - CACHE_DAYS * 86400000).toISOString();
    for (const k of Object.keys(map)) if ((map[k].cachedAt || '') < floor) delete map[k];
    return map;
  }
  function cacheDigest(day, view) {
    const all = purge(store.read('spotter-digests', {}));
    all[day] = { view, cachedAt: new Date().toISOString() };
    store.write('spotter-digests', all);
  }
  function cachedDigest(day) {
    const hit = store.read('spotter-digests', {})[day];
    return hit ? { view: hit.view, cachedAt: hit.cachedAt } : null;
  }
  function cacheArticle(id, article) {
    const all = purge(store.read('spotter-articles', {}));
    all[id] = { article, cachedAt: new Date().toISOString() };
    store.write('spotter-articles', all);
  }
  function cachedArticle(id) {
    const hit = store.read('spotter-articles', {})[id];
    return hit ? hit.article : null;
  }

  // --- gestures: sent live, queued when the train has no companion ----------
  async function gesture(documentId, kind) {
    try {
      await api('/gesture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ documentId, kind }) });
    } catch {
      const q = store.read('spotter-gesture-queue', []);
      q.push({ documentId, kind, at: new Date().toISOString() });
      store.write('spotter-gesture-queue', q);
    }
  }
  async function flushGestures() {
    const q = store.read('spotter-gesture-queue', []);
    if (!q.length) return;
    const remaining = [];
    for (const g of q) {
      try {
        await api('/gesture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ documentId: g.documentId, kind: g.kind }) });
      } catch { remaining.push(g); }
    }
    store.write('spotter-gesture-queue', remaining);
    if (q.length && !remaining.length) setStatus('gestures from the ride delivered');
  }

  function setStatus(text) { $('status').textContent = text; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // --- views -----------------------------------------------------------------
  function tokenForm(message) {
    $('main').innerHTML =
      '<form class="token" id="tf">' +
      (message ? '<p class="banner">' + esc(message) + '</p>' : '') +
      '<label for="tok">Pairing token</label>' +
      '<input id="tok" type="password" autocomplete="off" required ' +
      'placeholder="printed in the companion terminal at startup">' +
      '<p class="muted">Entered once, kept on this phone. The token gates access on the LAN; ' +
      'it does not encrypt the wire — home network trust, stated.</p>' +
      '<button class="primary" type="submit">Pair</button></form>';
    $('tf').addEventListener('submit', (e) => {
      e.preventDefault();
      store.token = $('tok').value.trim();
      void boot();
    });
  }

  function digestList(view, day, servedFrom) {
    const when = view.ranAt ? new Date(view.ranAt).toLocaleString() : null;
    let html = '';
    if (servedFrom === 'cache') {
      html += '<p class="banner">Offline — showing the morning pull' +
        (when ? ' (produced ' + esc(when) + ')' : '') + '. Gestures will queue and deliver later.</p>';
    } else if (when) {
      html += '<p class="muted">Produced ' + esc(when) + '</p>';
    }
    if (!view.entries.length) {
      html += '<p class="muted">Nothing here for this day' +
        (view.ranAt ? ' — a thin day: nothing earned a slot.' : ' yet.') + '</p>';
    }
    for (const e of view.entries) {
      html += '<div class="card' + (e.readAt ? ' read' : '') + '">' +
        '<h2><a href="#read/' + esc(e.documentId) + '" data-id="' + esc(e.documentId) + '">' + esc(e.title) + '</a></h2>' +
        (e.reason ? '<p class="reason">' + esc(e.reason) + '</p>' : '') +
        '<div class="row"><span class="score">' + Math.round(e.score) + '</span>' +
        '<span class="badge">' + esc(e.engine) + '</span>' +
        (e.scoredOn === 'abstract' ? '<span class="badge">scored on abstract</span>' : '') +
        (e.readAt ? '<span class="badge">read</span>' : '') +
        '</div></div>';
    }
    $('main').innerHTML = html;
    for (const a of document.querySelectorAll('a[data-id]')) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        void openArticle(a.getAttribute('data-id'), day);
      });
    }
  }

  async function openArticle(id, day) {
    void gesture(id, 'open');
    let article = null, offline = false;
    try { article = await api('/article/' + encodeURIComponent(id)); cacheArticle(id, article); }
    catch { article = cachedArticle(id); offline = true; }
    const view = (cachedDigest(day) || { view: { entries: [] } }).view;
    const entry = view.entries.find((e) => e.documentId === id);
    let html = '<p class="back"><a href="#" id="back">← Digest</a></p>';
    if (article) {
      html += '<article class="reading"><h2>' + esc(article.title) + '</h2>' +
        (offline ? '<p class="banner">Offline — cached copy.</p>' : '') +
        article.text.split(/\\n{2,}|\\n/).filter(Boolean).map((p) => '<p>' + esc(p) + '</p>').join('') +
        '</article>';
    } else {
      html += '<p class="banner">' + (entry && entry.scoredOn === 'abstract'
        ? 'This entry was scored on its abstract — no page text was cached, and offline there is nothing more to show.'
        : 'No cached text for this entry' + (offline ? ' and the companion is unreachable.' : '.')) + '</p>';
    }
    if (entry) {
      html += '<div class="row">' +
        '<a href="' + esc(entry.url) + '" target="_blank" rel="noopener">Open original</a>' +
        (entry.readAt ? '' : '<button id="mark">Mark read</button>') + '</div>';
    }
    $('main').innerHTML = html;
    $('back').addEventListener('click', (e) => { e.preventDefault(); void boot(); });
    const mark = $('mark');
    if (mark) mark.addEventListener('click', () => { void gesture(id, 'read'); mark.replaceWith('read ✓'); });
  }

  // Eager pull: the morning gesture. Every entry's text lands in localStorage
  // so the train needs nothing from the network.
  async function prefetch(view) {
    for (const e of view.entries) {
      if (cachedArticle(e.documentId)) continue;
      try { cacheArticle(e.documentId, await api('/article/' + encodeURIComponent(e.documentId))); }
      catch { /* scored on abstract, or older than the reading cache — shown as such */ }
    }
  }

  async function boot() {
    if (!store.token) { tokenForm(); return; }
    let days = [];
    try {
      days = (await api('/days')).days.slice(0, CACHE_DAYS);
      setStatus('live');
    } catch (err) {
      if (String(err && err.message).includes('unauthorized')) { tokenForm('That token was refused — check the companion terminal.'); return; }
      const mirror = store.read('spotter-digests', {});
      days = Object.keys(mirror).sort().reverse();
      setStatus('offline');
      if (!days.length) {
        $('main').innerHTML = '<p class="banner">The companion is unreachable and nothing is cached yet. ' +
          'Open this page once on your home network in the morning.</p>';
        return;
      }
    }
    const sel = $('day');
    sel.hidden = days.length < 2;
    sel.innerHTML = days.map((d, i) => '<option value="' + esc(d) + '">' + (i === 0 ? 'latest' : esc(d)) + '</option>').join('');
    sel.onchange = () => void show(sel.value);
    await show(days[0]);
    void flushGestures();
  }

  async function show(day) {
    if (!day) return;
    try {
      const view = await api('/digest?day=' + encodeURIComponent(day));
      cacheDigest(day, view);
      digestList(view, day, 'live');
      void prefetch(view);
    } catch {
      const hit = cachedDigest(day);
      if (hit) digestList(hit.view, day, 'cache');
      else $('main').innerHTML = '<p class="banner">Nothing cached for ' + esc(day) + ' and the companion is unreachable.</p>';
    }
  }

  window.addEventListener('online', () => { void flushGestures(); });
  void boot();
})();
</script>
</body>
</html>
`;
