# Eval harness

Measures an axis scorer against **your** hand labels — the instrument that tells
you whether a given model is good enough, before any of it ships. Runs headless
in Node (no browser, no extension, no `OLLAMA_ORIGINS`).

## Run

```bash
ollama pull qwen2.5:3b        # or whatever you want to test
npm run eval                  # Pollution axis, default corpus + model
npm run eval -- --model=mistral
npm run eval -- --corpus=eval/corpus/mine.json --host=http://localhost:11434
```

Output: per-item `label` (your judgment) vs `model` (its judgment), absolute
error, and whether both land in the same bucket (clean / borderline / pollution);
then a summary with **MAE** and **bucket agreement**.

## The corpus

`eval/corpus/pollution.json` — an array of items:

```json
{
  "id": "short-id",
  "authorName": "...",
  "text": "the post text",
  "label": { "pollution": 0 },
  "note": "optional: why you scored it this way"
}
```

`pollution` is your judgment, `0` = clean / substantive, `100` = pure engineered
bait. Bucket boundaries: `0–33` clean, `34–66` borderline, `67–100` pollution.

The seed corpus is **illustrative** — synthetic posts spanning the range. Replace
it with real posts you've judged yourself; the numbers only mean something against
your own calibration. (Pasting real post text here is fine: this is local, and the
corpus is not shipped in the extension build.)

## Labeling from the feed (the easy path)

You don't have to hand-edit JSON. In the extension:

1. Browse LinkedIn; click any **Spotter badge** → rate the post
   **Clean / Borderline / Pollution** (your judgment of engineered-ness,
   not of the topic).
2. Labels accumulate in the dashboard's **Eval** tab — review, delete
   mislabels, and **Export JSON** when you have ~30–50 spanning the range.
3. Save the download as `eval/corpus/mine.json`, then:
   ```bash
   npm run eval -- --corpus=eval/corpus/mine.json
   ```

Buckets map to numeric labels clean=10 / borderline=50 / pollution=90, so
bucket agreement is the meaningful metric for in-feed labels; MAE is finer
than the labels themselves.

## Labeling from URLs (when the feed under-supplies a bucket)

The feed is a biased sample — clean substantive posts are rarer than slop.
Curate URLs yourself instead:

1. Copy `eval/corpus/urls.example.json` → `eval/corpus/urls.json` and fill
   in URLs per bucket (any web page, not just feed posts).
2. `npm run fetch-corpus` — fetches each URL, extracts readable text,
   writes `eval/corpus/from-urls.json`. Already-fetched URLs are cached
   (re-fetch with `--force`); failures (auth walls, JS-only pages) are
   listed — paste those texts into the output by hand.
3. **Review the extracted text** — the extractor is a heuristic and page
   chrome can leak in. Trim by hand where needed.
4. Run against it, alone or concatenated with your in-feed labels:
   ```bash
   npm run eval -- --corpus=eval/corpus/from-urls.json
   npm run eval -- --corpus=eval/corpus/from-urls.json,eval/corpus/mine.json
   ```

The fetch→extract step here is the first piece of Mode B/C ingestion
(spec §5): the eval tool and the future scan-for-value share it.
