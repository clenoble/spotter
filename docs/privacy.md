# Privacy

## What stays on your machine

- Preference document
- Consumption log (metadata + LLM-generated summary — **no raw post text**)
- Model changelog
- All LLM calls in default mode (local Ollama on `localhost:11434`)

## What leaves your machine

- **Default mode**: nothing.
- **Cloud mode (v2, opt-in)**: post text and prompts are sent to the configured cloud LLM provider using a user-supplied API key. Post text is never sent without explicit opt-in.

## What is NEVER stored

- Raw post text. The analyst LLM summarizes at ingestion; only the structured summary is stored; the raw text is discarded.

**One explicit exception — the eval corpus.** When you *rate* a post (clicking its Spotter badge and choosing clean / borderline / pollution), that post's raw text is captured into a separate local store (`evalCorpus`), so the scorer can be measured against your own judgment (`npm run eval`). This is authored data collection, not surveillance: it happens only on your explicit per-post action, it is listed in full on the dashboard's Eval tab, each entry is deletable there, and it never leaves your machine unless you export it yourself.

## What is NEVER sent

- No telemetry. No analytics. No crash reports to any server.

## Encryption at rest

**TODO before v1 public release.** Currently IndexedDB is unencrypted on the user's disk. When implemented, encryption will mirror Sovereign's posture (XChaCha20-Poly1305, per-document keys) to keep the eventual Sovereign integration coherent.

## Data export and deletion

- Preferences: `toMarkdown(doc)` exposes a plain-text dump; copy and paste anywhere.
- Consumption log: exportable as JSON (TODO — UI).
- Nuclear: uninstall the extension. All IndexedDB data is destroyed by the browser.
