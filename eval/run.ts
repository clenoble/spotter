import { readFileSync } from 'node:fs';
// Core only — never `src/shared`, which is extension-side and carries DOM types.
import {
  pollutionScorer,
  createProvider,
  DEFAULT_MODEL,
  type AxisScore,
  type Content,
  type PreferenceDoc,
  type ProviderId,
  type ScoringContext
} from '../src/core/index';

/**
 * Headless eval harness for the Pollution axis. Runs the scorer against a
 * hand-labelled corpus and reports how well the model agrees with *your*
 * judgment — the instrument that tells you whether a given local (or cloud)
 * model is good enough, and that makes the privacy/quality trade informed.
 *
 *   npm run eval                       # qwen2.5:3b, default corpus
 *   npm run eval -- --model=mistral    # compare another model
 *   npm run eval -- --corpus=eval/corpus/mine.json
 */

interface CorpusItem {
  id: string;
  authorName: string;
  text: string;
  label: { pollution: number }; // your judgment: 0 = clean, 100 = pure bait
  note?: string;
}

const args = parseArgs(process.argv.slice(2));
// The harness has to reach every backend the product can, or it cannot answer
// the question it exists for: what does cloud judgment buy over local, on *my*
// labels (spec §6.1.3). Key from the environment — never a shell argument,
// which would land in the shell history.
const providerId = (args.provider ?? 'ollama') as ProviderId;
const apiKey =
  args.key ?? process.env.ANTHROPIC_API_KEY ?? process.env.GEMINI_API_KEY ?? undefined;
const model = args.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL[providerId];
const host = args.host ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
// Comma-separated paths concatenate corpora (e.g. in-feed labels + URL fetches).
const corpusPath = args.corpus ?? 'eval/corpus/pollution.json';

const EMPTY_PREFS: PreferenceDoc = {
  version: 1,
  topicsMore: [],
  topicsLess: [],
  tonePreferences: [],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.15,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: new Date(0).toISOString()
};

async function main(): Promise<void> {
  const corpus = corpusPath
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => JSON.parse(readFileSync(p, 'utf8')) as CorpusItem[]);
  let provider;
  try {
    // The harness is a host too, and supplies its own transport rather than
    // letting the core reach for one (§6.3). Under Node the global `fetch`
    // leaves no browser cache behind; a host with different traces passes a
    // different function, which is why the capability is injected at all.
    provider = createProvider({
      id: providerId,
      host,
      apiKey,
      transport: (url, init) => fetch(url, init)
    });
  } catch (err) {
    console.error(
      `\n✗ ${err instanceof Error ? err.message : String(err)}\n\n` +
        `  Set it in the environment rather than on the command line:\n` +
        `    ANTHROPIC_API_KEY=… npm run eval -- --provider=anthropic\n` +
        `    GEMINI_API_KEY=…    npm run eval -- --provider=gemini\n`
    );
    process.exit(1);
  }

  console.log(
    `\nPollution axis — provider=${providerId}  model=${model}  corpus=${corpusPath} (${corpus.length} items)\n`
  );
  console.log(
    pad('id', 18) + pad('label', 7) + pad('model', 7) + pad('|err|', 6) + pad('buckets', 22) + 'reason'
  );
  console.log('-'.repeat(98));

  let absErrSum = 0;
  let bucketHits = 0;
  let unjudged = 0;

  for (const item of corpus) {
    const ctx: ScoringContext = {
      content: toContent(item),
      prefs: EMPTY_PREFS,
      models: { pollution: model }
    };

    let result: AxisScore;
    try {
      result = await pollutionScorer.score(ctx, provider);
    } catch (err) {
      // The provider's own message is the truth; the hints below only help
      // when it is a setup problem. Guessing "Ollama isn't running" at a
      // cloud 400 sends the reader to the wrong place entirely.
      const hint =
        providerId === 'ollama'
          ? `  Check Ollama is running at ${host}, and \`ollama pull ${model}\`.\n` +
            `  (No OLLAMA_ORIGINS needed here — this runs in Node, not the browser.)\n`
          : `  Check the API key is valid and the model id '${model}' exists on ${providerId}.\n`;
      console.error(
        `\n✗ ${providerId} could not score this item.\n\n  ` +
          (err instanceof Error ? err.message : String(err)) +
          `\n\n${hint}`
      );
      process.exit(1);
    }

    const label = item.label.pollution;

    // An axis that could not judge fails open (gate 1 → pollution 0). Scoring
    // that as agreement would credit the model for every clean item it failed
    // on — the fail-safe silently flattering the instrument. Unjudged items are
    // excluded from both statistics and counted on their own line instead.
    if (!result.ok) {
      unjudged++;
      console.log(
        pad(item.id, 18) +
          pad(String(label), 7) +
          pad('—', 7) +
          pad('—', 6) +
          pad('unjudged', 22) +
          '⚠ ' +
          truncate(result.reason, 38)
      );
      continue;
    }

    const modelPollution = Math.round((1 - result.score) * 100);
    const absErr = Math.abs(modelPollution - label);
    const lb = bucket(label);
    const mb = bucket(modelPollution);
    const hit = lb === mb;

    absErrSum += absErr;
    if (hit) bucketHits++;

    console.log(
      pad(item.id, 18) +
        pad(String(label), 7) +
        pad(String(modelPollution), 7) +
        pad(String(absErr), 6) +
        pad(`${lb} ${hit ? '=' : '≠'} ${mb}`, 22) +
        (hit ? '  ' : '⚠ ') +
        truncate(result.reason, 38)
    );
  }

  const n = corpus.length;
  const judged = n - unjudged;
  console.log('-'.repeat(98));
  if (judged === 0) {
    console.log(`\nn=${n}   no item could be judged — the model never returned usable JSON.\n`);
    return;
  }
  console.log(
    `\nn=${n}   judged=${judged}${unjudged ? `   unjudged=${unjudged}` : ''}   ` +
      `MAE=${(absErrSum / judged).toFixed(1)}   ` +
      `bucket agreement=${((bucketHits / judged) * 100).toFixed(0)}% (${bucketHits}/${judged})\n`
  );
}

function bucket(p: number): 'clean' | 'borderline' | 'pollution' {
  if (p <= 33) return 'clean';
  if (p <= 66) return 'borderline';
  return 'pollution';
}

function toContent(item: CorpusItem): Content {
  return {
    id: item.id,
    platform: 'linkedin',
    authorHandle: '',
    authorName: item.authorName,
    text: item.text,
    mediaTypes: [],
    postedAt: null
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
