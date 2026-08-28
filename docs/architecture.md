# Architecture

## Overview

Spotter is a browser extension that re-ranks a social feed (LinkedIn in v1) against a user-owned preference document, and surfaces the user's consumption back to them in a dashboard.

## Components

### Content script — `src/content/`

Runs on matched feed URLs. Picks a `FeedAdapter` via `adapterFor(location.href)`. For each post the adapter emits:
- Calls the fast re-ranker LLM
- Applies the score and reorders the DOM
- Emits engagement events for the consumption log

### Background service worker — `src/background/`

- Handles action-button click → opens the dashboard in a new tab
- v2+: coordinates long-lived tasks that outlive a single page (e.g. batched ingestion summarization queue)

### Dashboard — `src/dashboard/`

Svelte 5 app. Tabs:
- **Overview** — neutral view of what the user consumed
- **Chat** — analyst LLM for tuning preferences (editable with diff approval)
- **Changelog** — implicit learnings awaiting user approval
- **Preferences** — direct editor for the preference document

### Onboarding — `src/onboarding/` (TODO)

First-install chat flow that seeds the preference document via ~5 questions.

## The pluggable boundary — `FeedAdapter`

See [feed-adapter-contract.md](feed-adapter-contract.md). All platform-specific code lives behind this interface. LinkedIn is the v1 implementation; Bluesky / Mastodon / RSS will follow without changes outside `src/lib/<platform>/`.

## Two-LLM topology

- `src/lib/llm/fast.ts` — fast re-ranker, called per-post from the content script. Default `qwen2.5:3b` via local Ollama.
- `src/lib/llm/analyst.ts` — larger model, called for summarization, chat, and changelog-entry generation. Default `qwen2.5:7b`.
- `src/lib/llm/ollama.ts` — shared Ollama HTTP client.

Both default to local Ollama; cloud fallback is opt-in with user-supplied key (v2).

## Data flow

```
LinkedIn page
     │
     ▼
content script ──observe──▶ fast LLM ──score──▶ reorder DOM
     │                                               │
     └───engagement events──▶ IndexedDB (consumption)│
                                     │                │
                                     ▼                │
                              analyst LLM ──summary──┘
                                     │
                                     ▼
                              dashboard reads ─▶ user
                                     │
                                     ▼
                              chat edits ─▶ preference doc (with diff approval)
                                     │
                                     ▼
                              fast LLM reads updated doc
```

## Storage — `src/lib/store/db.ts`

IndexedDB with three object stores:
- `preferences` — single entry keyed `'current'`, the preference document
- `consumption` — per-post `ConsumptionLogEntry` (metadata + LLM summary, NO raw post text)
- `changelog` — implicit learnings, user approval states

Encryption at rest: **TODO before v1 public release.** Currently unencrypted IndexedDB for POC.

## Integration with Sovereign (v2+)

The `FeedAdapter` interface, preference-document schema, and consumption-log entries are all designed to serialize cleanly into Sovereign's SurrealDB. Spotter can then ship as a WASM skill in `sovereign-skills` (or a tool in `sovereign-ai` at Observe Level 0) without breaking changes.

## Integration with Crabe (v2+)

[Crabe](https://github.com/clenoble/content-reliability-assessment-browser-extension) provides reliability assessment for content the user reads.

- **v2**: Crabe scores surface on the Spotter dashboard alongside consumption. Display-only.
- **v3**: The preference document gains a `reliabilityFilters` block; the re-ranker honors user-set Crabe thresholds.

Crabe scores are delivered through a side channel (Crabe → Sovereign's data layer in the long run; a direct cross-extension message in the browser-extension-only near term). The `FeedAdapter` contract does not change to accommodate Crabe — reliability is a separate signal joined to posts by id.
