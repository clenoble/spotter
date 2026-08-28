# Spotter v0.1 — the finite daily digest

*Written from what the tag contains, and from one measured end-to-end run — not from intentions.*

Spotter v0.1 is the first version that does what the project describes: it **retrieves and filters, to spot the good and the great**. It searches your declared topics on a self-hosted meta-search engine (SearXNG) and an academic source (OpenAlex), reads the feeds you declare, scores every candidate on six axes with a local LLM, passes the survivors through an editorial judgment of the whole slate — and surfaces **at most five items**, each carrying its reasons. A digest that ends cannot become a feed.

## What is in it

- **Six axes**: relevance, quality, novelty, challenge (contributions — reasons to surface) and pollution, calibration (gates — they only demote). An axis that cannot judge says so, all the way to the screen.
- **The editorial pass**: a librarian, not a ranker. It judges the slate — repetition demotes excellence, absence can raise a middling piece — and runs its own second round of queries, contesting what the day's *documents* claim, never what you believe. Nothing about you is modelled, stored, or sent: there is no stance model in v0.1, and therefore nothing intimate on this host.
- **Declared abstracts**: when a page cannot be fetched but the provider supplies a real summary (an OpenAlex abstract, a feed description), the axes score it and the digest says `scored on abstract`. A verdict about a summary presented as a verdict about the article is the claim this design exists to prevent.
- **Held back, fully accounted**: refused (with the editor's reason), beaten (with the margin), or unruled (the editor returned no verdict — recorded as such, never converted into one).
- **Three trigger tiers**, and the digest always says which produced it: overnight if the browser is alive, else your first interaction of the day, else the button.
- **Reading is an explicit gesture.** Opening is recorded as opening; *read* is a button. Never a timer, a scroll position, or a dwell measurement — and what you read never feeds back into what gets selected.
- **Persistence by class**: the surfaced digest is durable (IndexedDB); the night's run report is session memory and dies with the browser — and the dashboard says so when it has, rather than pretending the night held nothing back.

## What the validation run measured (2026-08-10)

One full night, headless, on live SearXNG + OpenAlex + two live feeds, local models only:

- **9 funnels · 164 searched → 98 past triage → 57 fetched → 90 scored · 75 minutes.** 33 of the 90 were scored on declared abstracts — the acquisition wall (§5.1.1 of the spec) is real, and the abstract ruling is what keeps the academic haul usable.
- **The judge rules only on what it selects.** All ten held-back items came back `unruled`: the local judge (qwen2.5:7b) selected five with reasons and stayed silent on the rest, despite being asked for a decision on every id. The protective assembly did exactly its job — silence stayed visible instead of becoming an invented verdict — but the *refused-with-reason* half of Held back, the interesting half, does not yet happen with this model. Known, measured, not prompt-tuned away (iterating a prompt against one run is how a test becomes a target).
- **Feed volume can outvote declared topics.** With one topic declared and two feeds subscribed, the digest leaned toward the feeds' subjects: quality + novelty + challenge can lift an off-topic-but-good item over the relevance signal. This is the composition policy working as configured, visible in every entry's axis breakdown — and the right knob (a relevance floor, or per-source weights) is a user-policy decision, not a hidden default to slip in.
- **Scores compress at the top** (87–93 across the slate). The ranking discriminates less than the axes' reasons do; the reasons are the more informative half, which is why they are shown.

## Known limits

- Local-only search substrates in v0.1; a cloud generalist is deferred deliberately.
- The stance model, the margin and plumbing counters, the active probe for never-returned sources, and the archive export are designed (spec §5.2, §6.5) and not built.
- One earlier hang taught this release its rule: **every outbound call now carries a timeout set by its caller** — a page fetch that takes 20s is a hung server; an LLM judging a slate at 20s is working. One hanging socket costs one candidate, never the night.

## Running it

See the README. In short: load `dist-chrome/` (or `dist-firefox/`), have Ollama with `mistral` and `qwen2.5:7b`, a SearXNG instance with JSON output, declare topics and feeds in the Digest tab, press *Search now* — or let the morning tiers do it.
