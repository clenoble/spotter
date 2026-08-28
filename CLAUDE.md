# Spotter — context for Claude

## What this is

Spotter is a personal attention-allocation engine: it **retrieves and filters, to spot the good and the great**. It queries existing search engines — no crawler — filters the haul on six axes against a preference document the user owns and can edit via chat, and logs consumption locally, surfacing the user back to themselves in a neutral dashboard. LLM backend is user-chosen: local via Ollama by default, or Anthropic/Gemini with the user's own key.

**Canonical source of truth is [docs/attention-engine-spec.md](docs/attention-engine-spec.md) (v0.9).** Where this file and the spec disagree, the spec wins and this file is stale. The LinkedIn feed re-ranker described below still runs, but it is the POC surface, not the product.

**State at v0.1** (2026-08-10): the product is the **finite daily digest** — all six axes, the editorial pass with its own second retrieval round, Mode R (SearXNG + OpenAlex) and Mode B (declared feeds), three trigger tiers, per-class persistence (durable digest in IndexedDB, session-class run report), and the Digest dashboard tab with the two explicit gestures. Instance decisions taken during the autonomous build are logged in [docs/decisions-v0.1.md](docs/decisions-v0.1.md). The stance model, the margin/plumbing counters, the active probe and the archive format are **not** in v0.1.

Part of a user-first ecosystem with two siblings:
- [Sovereign](https://github.com/clenoble/sovereign) — graphical environment / personal OS; the long-term home. Rust workspace, Tauri 2.0 + Svelte 5, SurrealDB, llama.cpp. Has a `sovereign-skills` WASM plugin registry and `sovereign-ai` tool-calling surface — those are our v2 integration targets.
- [Crabe](https://github.com/clenoble/content-reliability-assessment-browser-extension) — the stack reference. TS + Vite MV3 browser extension, dual Chrome/Firefox build, local Ollama + optional cloud LLM.

## Core design principles

1. **When in doubt, the user decides.** Any ambiguity surfaces as a user choice — product runtime AND design-time. Never resolve silently.
2. **Transparency is the primary interface.** The dashboard reflecting consumption + chat-with-diff for preference editing IS the product.
3. **Local first.** Nothing leaves the device in default mode. Cloud LLM is opt-in with user-supplied key (mirroring Crabe's dual-mode pattern).
4. **Modular from day one.** All platform-specific code lives behind adapters. Take the extra up-front scaffolding cost to enable cleaner Sovereign integration later.
5. **Retrieve, then filter hard.** *(Reversed at spec v0.7 — this used to read "re-rank, don't retrieve".)* Re-ordering a platform's feed only re-orders the platform's bubble; no amount of rescoring puts novelty or disagreement into a set that never held them. Spotter forms its own candidate set by querying existing search engines and discards most of it. **No crawler, no index**, and only engines that neither personalise results nor force ads — a personalising engine hands back a bubble of its own making.

## Stack

- TypeScript, strict mode
- Svelte 5 (with runes) — matches Sovereign
- Vite + `@crxjs/vite-plugin` for MV3
- Chrome + Firefox via `build-chrome.js` / `build-firefox.js`
- LLM backend chosen by the user: Ollama (default, `mistral`), Anthropic, or Gemini with their own key — see `src/core/llm/`
- IndexedDB for consumption log and preference doc
- AGPL-3.0

## Two-LLM topology

- **Fast scorer** (default `mistral`): runs the axes, once per candidate. On the POC feed surface that means per-post while scrolling, so latency is visible; under retrieval it means per-candidate-that-survived-triage, so the constraint becomes cost per haul rather than scroll lag.
- **Analyst** (default `qwen2.5:7b`): called for dashboard insights, chat, preference-doc edits, and the ingestion-time structured summary of each post.

Rationale: scoring needs speed and runs on volume; chat needs reasoning depth and runs rarely. A single model is a bad compromise. Matches Sovereign's own 3B/4B router + 7B reasoner split. Measured on a synthetic corpus (see `eval/`): local models are markedly weaker than cloud ones at spotting machine-written filler, which is the dominant pollution in search results — so this is exactly where the user's backend choice costs or buys something.

## Key abstractions

- `FeedAdapter` (`src/lib/feed-adapter.ts`) — the pluggable boundary for a platform integration. LinkedIn lives in `src/lib/linkedin/`. Contract: `docs/feed-adapter-contract.md`.
- `PreferenceDoc` — markdown document the user owns. Seeded by onboarding, edited by chat, read by the re-ranker. Schema: `docs/preference-doc-schema.md`.
- `ConsumptionLog` — per-post record in IndexedDB: metadata + LLM-generated structured summary. **No raw post text stored.**
- `ModelChangelog` — every implicit learning surfaces here as "I noticed X — accept / reject / tell me more."

## What NOT to do

- Do not store raw post text. Only metadata + structured LLM summary. Self-surveillance is a real risk. **Single sanctioned exception:** the eval corpus (`evalCorpus` store) captures raw text when — and only when — the user explicitly rates a post in-feed; inspectable and deletable on the dashboard's Eval tab, exportable for `npm run eval`. See docs/privacy.md. Do not add further exceptions.
- Do not add features or controls without a dashboard surface — the dashboard is the control contract.
- Do not silently resolve ambiguity (see principle #1).
- Do not put LinkedIn-specific code outside `src/lib/linkedin/`. The adapter abstraction is load-bearing — if you want to cheat it, the abstraction is wrong and must be lifted.
- Do not introduce analytics/telemetry. Zero.

## Future integration with Sovereign

**Decided 2026-08-04 — spec §6.2–§6.5 is authoritative; the list below is what survives of the earlier guesses.**

- **Sovereign is a fourth build target, not a fork.** One source; the host is chosen by a `$host` alias resolved in `vite.config.ts` — an alias, *not* a conditional import, because with an alias Rollup never resolves the other host's module at all. **The Sovereign code must never ship behind a disabled flag**: inert code is a re-pointable capability, and on the persisted challenge cursor the difference between absent and present-but-off is the difference between a barrier and a promise. A build test greps the produced bundle and fails if the other host's marker is in it.
- **The body is a bundle in Sovereign's own browser** — no WASM skill, no Rust interop for now. What changes is the host adapter. Note that `src/lib/` *is already* the browser host under another name; the work is to name it and give it a sibling, not to invent a layer.
- **The unit of divergence is a capability, never a feature.** The core is handed capabilities and never reaches for one. Before declaring anything Sovereign-only, apply the test: *could the browser host implement this safely if someone wrote the code?* If yes it is unfinished work, not a host gate.
- **Storage**: judgments are their own records keyed by *(document, judge)* — never judge-specific columns on the document, which is the contract agreed with Sovereign and Crabe. `degraded` is **declared by the judge, never computed by the storage layer**. Only what the editorial pass surfaced enters Sovereign's base, `is_owned: false`; the reject window stays local.
- **Honor Sovereign's 8 UX rules** — especially Plan Visibility (explain *why* a ranking) and Sovereignty Halo (distinguish retrieved content from user-owned).
- **Several installations may coexist and diverge freely**; merging is additive with optional dedup by cleaned-URL id, and **every entry records its surface**. There is no export from Sovereign outward.
- Sovereign will eventually be Spotter's source of cross-platform "data wealth" — aggregated signal across all the user's feeds

## Future integration with Crabe

Crabe is **load-bearing, not optional** — and more so under retrieval than under re-ranking, because search returns arbitrary pages of unknown provenance rather than sources the user chose to follow.

- **Crabe emits an axis vector, not a score** (as of 2026-08-03): four axes (`content`, `provenance`, `lateral`, `citations`), each contribution or gate, with the same composition semantics as ours — borrowed from this project deliberately, so the contract needs no translation layer. `not_run` carries a reason and is **never** zero.
- Every claim carries an evidence level (`verified` > `retrieved` > `assessed` > `recalled` > `absent`). A `recalled` verdict should not gate as hard as a `verified` one.
- **Crabe is text-only.** The media axis was researched and abandoned on evidence; a `SCOPE_NOTICE` rides inside the vector so consumers inherit the limit with the data. Never assume Crabe can speak to an image.
- Crabe joins through a side channel, not the `FeedAdapter` — the adapter contract does not change.
- Open, to be co-designed: Crabe's Phase 4 merges axes into a synthesis. Deferred deliberately so we settle together whether Spotter consumes the raw vector (their preference, and ours) or a composite it would then have to decompose.

The `FeedAdapter` interface, preference-doc schema, and consumption-log format are designed to survive these transitions without breaking changes.
