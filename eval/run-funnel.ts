import {
  retrieve,
  createSearxngAdapter,
  createOpenAlexAdapter,
  createFetcher,
  createOllamaProvider,
  relevanceScorer,
  pollutionScorer,
  type PreferenceDoc,
  type SearchAdapter
} from '../src/core/index';

/**
 * Run the candidate funnel end-to-end, against a live SearXNG and a live model.
 *
 * The adapters were each verified alone; **the funnel has never run**. Every
 * number below is therefore a first measurement, not a check that something
 * still works — and the point of this harness is to find out what the design
 * gets wrong in contact with the real web, not to demonstrate that it does not.
 *
 *   npx tsx eval/run-funnel.ts "attention economy critique"
 *   npx tsx eval/run-funnel.ts --academic "attention allocation"
 *
 * It reports and judges nothing. Where a number looks wrong, it is a finding
 * for a person, not a threshold for the harness.
 */

const argv = process.argv.slice(2);
const useAcademic = argv.includes('--academic');
const query = argv.filter(a => !a.startsWith('--')).join(' ') || 'attention economy critique';
const searxngUrl = process.env.SEARXNG_URL ?? 'http://localhost:8888';
const model = process.env.SPOTTER_MODEL ?? 'mistral';

// The harness is a host: it supplies the transport rather than letting the core
// reach for one (§6.3). Under Node the global `fetch` leaves no browser cache.
const transport = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 30_000)
  });

const prefs: PreferenceDoc = {
  version: 1,
  topicsMore: ['attention', 'technology criticism', 'information ecology'],
  topicsLess: ['celebrity', 'sport'],
  tonePreferences: ['substantive', 'argued'],
  authorsBoost: [],
  authorsMute: [],
  explorationRate: 0.2,
  explorationMode: 'mixed',
  customRules: [],
  updatedAt: new Date().toISOString()
};

async function main(): Promise<void> {
  const search: SearchAdapter = useAcademic
    ? createOpenAlexAdapter({ transport })
    : createSearxngAdapter({ baseUrl: searxngUrl, transport });

  console.log(`\nquery    : ${query}`);
  console.log(`substrate: ${search.id}${search.selfHosted ? ' (self-hosted)' : ''}`);
  console.log(`model    : ${model}\n`);

  const started = Date.now();
  const report = await retrieve({
    query: { q: query, count: 20 },
    search,
    fetcher: createFetcher(transport),
    provider: createOllamaProvider({ transport }),
    scorers: [relevanceScorer, pollutionScorer],
    prefs,
    composition: { weights: { relevance: 1 } },
    model
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const c = report.counts;
  console.log(`searched ${c.searched} → after triage ${c.afterTriage} → fetched ${c.fetched} → scored ${c.scored}`);
  console.log(`${seconds}s\n`);

  // Degree 2 of §5.2 — returned and never examined. Reported per reason,
  // because "we dropped 14" without saying why is not an account.
  if (report.triaged.length) {
    console.log('dropped before any fetch:');
    const byReason = new Map<string, number>();
    for (const t of report.triaged) byReason.set(t.reason, (byReason.get(t.reason) ?? 0) + 1);
    for (const [reason, n] of byReason) console.log(`  ${String(reason).padEnd(16)} ${n}`);
    console.log();
  }
  if (report.unreadable.length) {
    console.log(`could not be read: ${report.unreadable.length}`);
    for (const u of report.unreadable.slice(0, 5)) console.log(`  ${u.slice(0, 92)}`);
    console.log();
  }

  console.log('digest:');
  for (const s of report.digest) show(s);

  if (report.belowCut.length) {
    console.log('\nbelow the cut (the rest of the night’s work):');
    for (const s of report.belowCut.slice(0, 5)) show(s);
  }

  const degraded = [...report.digest, ...report.belowCut].filter(s => s.degraded);
  if (degraded.length) {
    console.log(`\n⚠ ${degraded.length} scored while an axis could not judge:`);
    for (const s of degraded.slice(0, 5)) {
      console.log(`  ${s.title.slice(0, 60)} — ungated: ${s.ungatedAxes.join(', ') || 'none'}`);
    }
  }
}

function show(s: {
  score: number;
  title: string;
  url: string;
  degraded: boolean;
  axes: Array<{ axis: string; score: number; reason: string; ok: boolean }>;
}): void {
  console.log(`\n  ${s.score.toFixed(1).padStart(5)}  ${s.title.slice(0, 70)}${s.degraded ? '  [degraded]' : ''}`);
  console.log(`         ${s.url.slice(0, 88)}`);
  for (const a of s.axes) {
    const flag = a.ok ? ' ' : '!';
    console.log(`       ${flag} ${a.axis.padEnd(10)} ${String(a.score).padStart(3)}  ${a.reason.slice(0, 74)}`);
  }
}

main().catch(err => {
  console.error('\n✗', err instanceof Error ? err.message : String(err), '\n');
  process.exit(1);
});
