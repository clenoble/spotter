# Spotter

**Retrieval and filter, to spot the good and the great.** A personal attention-allocation engine: it goes looking, and most of what it finds it discards.

Part of a user-first ecosystem alongside [Sovereign](https://github.com/clenoble/sovereign) (the graphical environment / personal OS) and [Crabe](https://github.com/clenoble/content-reliability-assessment-browser-extension) (content reliability assessment).

## Why

Recommendation algorithms aren't broken — they're aimed at the wrong target. Every major platform optimizes its feed for engagement, retention, and ad revenue. Those objectives don't belong to you.

And re-ranking a platform's feed is not enough: re-ordering a bubble leaves you in the bubble. Genuine novelty and disagreement are not in the set to surface, and no amount of rescoring puts them there.

So Spotter **retrieves**. It queries existing search engines (no crawler, no index — and only engines that neither personalise results nor force ads), reads the feeds of sources you declare, and filters the haul on six axes against a preference document you own. What survives is a **finite daily digest: at most five items, often fewer**. A digest that ends cannot become a feed.

## How it works (v0.1)

1. **Overnight** (or on your first interaction of the day, or on demand — whichever tier ran is always shown), Spotter searches your declared topics on a self-hosted meta-search engine ([SearXNG](https://docs.searxng.org/)) and an academic source ([OpenAlex](https://openalex.org/)), and reads your declared feeds.
2. Every candidate is scored on **six axes** by a local LLM (Ollama; bring-your-own-key cloud optional): four *contributions* — relevance, quality, novelty, challenge — and two *gates* — pollution and calibration. Gates only ever demote. An axis that cannot judge says so; it is never silently absorbed.
3. An **editorial pass** — a librarian, not a ranker — judges the slate as a whole: a superb piece that repeats Tuesday's does not run; a middling one on a subject absent for months can be raised. It runs its own second round of queries, contesting what the day's *documents* claim — never what you believe.
4. The digest shows **why** each item earned its slot, and *Held back* shows what did not — refused (with the reason), beaten (with the margin), or unruled. Nothing is hidden silently.
5. Reading is recorded by **explicit gesture only** — never a timer, a scroll position, or a dwell measurement.

The LinkedIn re-ranker of the early POC still runs as a legacy surface.

## Principles

- **You decide.** Ambiguity surfaces as a choice; nothing resolves silently.
- **Transparency is the interface.** Every surfaced item carries its reasons; everything held back is recoverable with its reason.
- **Local first.** Self-hosted search, local models, IndexedDB. Nothing leaves the device except the queries and fetches retrieval is *for* — and no single provider sees enough to build a profile.
- **No engagement loop.** What you read never feeds back into what gets selected. The read record serves a mirror, not the ranker.
- **Fail-safe, loudly.** A gate that fails opens — and says so all the way to the screen.

## Running it

```
npm install
npm run build          # dist-chrome/ and dist-firefox/
npm test               # correctness invariants (never outcomes)
```

Load `dist-chrome/` as an unpacked extension (or `dist-firefox/` as a temporary add-on). You will need [Ollama](https://ollama.com/) with `mistral` and `qwen2.5:7b` pulled, and a [SearXNG](https://docs.searxng.org/) instance (default `http://localhost:8888`) with JSON output enabled.

Canonical spec: [docs/attention-engine-spec.md](docs/attention-engine-spec.md).

## License

AGPL-3.0 — deliberately. The network-copyleft clause forecloses the SaaS this could otherwise quietly become.
