# Preference document schema

The preference document is the load-bearing artifact of Spotter. The user owns it, the re-ranker reads it, chat edits it (with diff approval), and the dashboard displays it.

## Fields

- `version` — schema version (currently `1`)
- `topicsMore` — topics the user wants more of
- `topicsLess` — topics the user wants less of
- `tonePreferences` — free-form tone/style preferences (e.g. "first-person reflection > third-person advice")
- `authorsBoost` — author handles to surface more
- `authorsMute` — author handles to suppress
- `explorationRate` — `0.0`–`1.0`, fraction of feed reserved for exploration
- `explorationMode` — `'new-topics'` | `'alternate-viewpoints'` | `'mixed'`
- `customRules` — free-form user-authored rules the re-ranker honors
- `updatedAt` — ISO timestamp of last change

## Serialization

- **Canonical form**: the JSON stored in IndexedDB under `preferences/'current'`
- **Display form**: markdown via `toMarkdown(doc)` in `src/lib/preference/schema.ts`

## Edit flow

1. User types in dashboard chat: "less motivational posts please"
2. Analyst LLM proposes a change — e.g. append `"motivational posts"` to `topicsLess`
3. Dashboard shows a diff
4. User accepts → doc is updated and `updatedAt` bumped
5. Next fast re-ranker call reads the new doc

## Invariants

- The document is never edited silently. Every change has a user-visible diff.
- Implicit behavioral signals NEVER directly edit this document. They create `ModelChangelogEntry` records with `status: 'pending'`; the user approves or rejects.

## Future: Crabe integration

- **v2**: surface [Crabe](https://github.com/clenoble/content-reliability-assessment-browser-extension) reliability scores on the dashboard alongside the consumption log. Each `ConsumptionLogEntry` gains an optional `reliability` field populated when Crabe is installed and has assessed the post. The dashboard shows reliability trends but does not filter on them yet.
- **v3**: the preference document gains a `reliabilityFilters` block (e.g. `minReliabilityScore`, required factual/opinion classification) that the re-ranker honors as a hard or soft constraint, per user choice. The same "user decides" principle applies — the user sets thresholds, the system does not impose them.

The `FeedAdapter` contract does not need to change for this; reliability scores come from a separate Crabe-provided side channel, not the adapter.
