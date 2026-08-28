# Spotter v0.2 — the companion release

Ten days after v0.1, the digest grew its production host and its phone surface — and every failure the first live runs measured got a mechanical answer, not a promise.

## New

- **The companion (host #3).** A local Node process produces the digest at night with the browser closed — the tier an MV3 worker could never honestly promise — and serves it: dashboard on localhost, phone on the LAN. Content is **pulled**; the only pushes are your own declarations (topics, feeds, examples, settings), from your dashboard to your machine. A pairing token gates every data route. It does **not** encrypt the wire — home-LAN trust boundary, stated, not slid.
- **Single-exe distribution.** `node scripts/build-companion-exe.mjs` → `spotter-companion.exe` (esbuild + Node SEA, reader embedded): no Node install needed. Unsigned — SmartScreen warns once; verify the SHA256 against `SHA256SUMS` attached here.
- **The phone reader**, served by the companion at `/`. Opened on the LAN in the morning, it eagerly mirrors the 3-day reading cache into localStorage; in the train it reads from the phone — **as long as the tab lives**. That limit is printed on the page rather than dressed up: a real offline install needs a service worker, hence HTTPS on the LAN, hence a certificate cost that is deferred and named. Gestures (open, read) queue offline and deliver on return.
- **Search depth is yours.** Candidates examined per funnel (default 20) is now a Preferences dial with its cost named beside it — run duration grows roughly linearly. It used to be a constant nobody chose; on a real run it silently governed 35% of the haul.
- **What can be started can be stopped.** A Stop button on the run banner. The run finishes the judgment in its hands and stops at the next candidate boundary — nothing half-written, nothing persisted, and a cancellation is never recorded as a substrate failure.
- **One slot per subject.** The editorial judge must name each decision's subject (schema-forced); the code keeps the strongest selection per subject and flips the rest to refusals with a mechanical reason. Added after a measured night where the judge selected four "pieces" of the same Hegel work, numbered first to fourth, while refusing others for "redundancy". In the nights since, the mechanical rule has not had to fire once — forcing the gesture moved the behavior.
- **Novelty is a conjunction** (ruling of 2026-08-20): new to the *human corpus* — a recent result or genuinely new idea, with an encyclopedia as the reference for "already known" — **and** new to *this reader* (not offered in recent runs). The score is the weaker condition. A freshly published introduction to a canonical work is not novel. Scores stopped clustering at 80.
- **A day shows its latest run, whole** — never the union of a day's runs (offers carry `runAt`; the ceiling of five survives a re-run).
- **One page is one fact.** Funnel reports deduplicate across substrates; the day view deduplicates across offers; the dashboard's projection lists are structurally immune to duplicate keys (the bug class that once emptied the whole tab).
- **A run the browser worker did not survive now says so** — an attempt with no outcome gets a banner on the next wake instead of vanishing. Automatic tiers on both hosts fire at most one attempt per day: success, failure or cancel alike, a run that ended stays ended.
- **Proxy shells unwrap.** A search engine once returned Google Translate's proxy of a page (`…translate.goog`, aimed at another language) as the article's address; `cleanUrl` now restores the page's own URL — identity, fetch and display all see the real site.
- Preferences saves reconcile the companion immediately (backend settings no longer wait for a worker wake).

## Known imperfections — measured, kept visible

- **The pollution gate misses ranking-engineered content on local models.** In a live run, a vendor's SEO blog topped the digest with pollution ×1 "clean" — the model checked the *engagement* adversary's markers (outrage, false urgency) on a *ranking* adversary's page. The real-world eval corpus (`eval/corpus/real-search.json`) opens with that miss, labeled; it — not prompt-tweaking against single examples — will decide whether the fix is a better prompt or a better judge.
- **Challenge can be fooled by advocacy that contests nothing** (80, same page, same run).
- **Novelty's "human corpus" is the judging model's own encyclopedic knowledge.** Too-new-for-the-weights reads as novel, which is the safe error; obscure-but-old can read as new, which is the residual one. A live encyclopedia lookup is designed but unbuilt (one-directional signal, per-candidate egress).
- **Subject exclusivity depends on the judge naming subjects consistently.** The title fallback catches page-per-chapter floods; cross-language duplicates of one story rely on the naming alone.
- **No language policy.** Topic queries go out verbatim; both search adapters accept a language parameter that no host sets, so the self-hosted engine's own default governs. Measured on a bilingual topic set: the minority language stays a minority through every funnel stage (~15%).
- **Mirrors of one paper can occupy several slate slots** — deduplication is by cleaned URL only; title near-duplicate detection at pool entry is not built.
- **Scores compress** into a narrow band (60–76 on a recent run). The margin is the honest instrument; the per-axis model comparison (mistral vs qwen2.5:7b) that would say where the judging is weakest is still open.
- **The exe is unsigned** (SmartScreen warning; check SHA256SUMS). The companion speaks plain HTTP on the LAN: the token gates, it does not encrypt.
- **Designed, not built:** margin & plumbing counters, the active probe, the stance model (Challenge judges the haul's prevailing line, never the reader's positions — by design until the stance model exists encrypted), the archive export, and the Crabe reliability stage — declared absent in the funnel view rather than silently missing.

## Install

Extension: load `spotter-v0.2-chrome.zip` unpacked (chrome://extensions, developer mode) or the Firefox zip as a temporary add-on. Companion: run `spotter-companion.exe` (or `npm run companion` from source); pair by pasting the printed token into the extension's Preferences. Phone: open the LAN URL the companion prints, paste the same token once.
