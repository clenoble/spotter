# `FeedAdapter` contract

The `FeedAdapter` interface (`src/lib/feed-adapter.ts`) is the extension point for adding a new feed source. It is load-bearing: the entire v2+ plan (Bluesky, Mastodon, RSS, and eventually Sovereign's cross-platform aggregation) hinges on this boundary staying clean.

## Required capabilities

A feed adapter MUST implement:

- `platform` — unique string identifier (`'linkedin'`, `'bluesky'`, `'mastodon'`, etc.)
- `matches(url)` — returns true if this adapter handles the given URL
- `observe(onPost)` — starts watching the feed; calls `onPost` for each new `RawPost`; returns a cleanup function
- `reorder(postIds)` — accepts a list of post IDs in the desired order and applies it to the DOM/UI
- `observeEngagement(onEvent)` — starts watching for user interactions with posts; calls `onEvent` for each `EngagementEvent`; returns a cleanup function

## Contract rules

1. **Do not hold post text outside the adapter.** Raw text is handed to `RawPost.text` once and consumed by the re-ranker and summarizer. Once the `PostSummary` exists, callers must discard the raw text.
2. **No platform-specific code outside `src/lib/<platform>/`.** Selectors, XHR hooks, auth quirks — all of it. If another part of the app needs to know a platform detail, the abstraction is wrong and needs to be lifted.
3. **Fail gracefully.** Selector rotation is routine. Missing fields should return `null` or empty, not throw.
4. **No network calls from the adapter.** The adapter only observes the DOM and emits events. Network decisions belong to the re-ranker and the analyst.

## Registering an adapter

Adapters self-register via `register(...)` on import. The content script imports the adapter file directly, then uses `adapterFor(location.href)` to pick one.

## Adding a new platform

1. Create `src/lib/<platform>/selectors.ts` (if DOM-based) — constants only
2. Create `src/lib/<platform>/adapter.ts` — implements `FeedAdapter`, ends with `register(myAdapter)`
3. Add the platform's URL pattern to the content_scripts match list in `src/manifest.json`
4. Import the adapter from `src/content/index.ts`

That is the full change set for a new platform. If it grows past that, something is wrong with the abstraction — fix it before continuing.
