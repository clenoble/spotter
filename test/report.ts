import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DigestOutcome, RetrievalReport, ScoredCandidate } from '../src/core/index';
import { toSessionReport, latestRunOffers } from '../src/shared/report';

/**
 * Invariants for the shared report builder — the merge point every host reads
 * through.
 *
 * The bug class these encode (measured 2026-08-19): the funnels report
 * independently, and two substrates finding the same page is normal — SearXNG
 * and OpenAlex both returned three of the same URLs on the first companion
 * run. Merged without deduplication, the same URL sat twice in `belowCut`,
 * the dashboard's keyed each block threw on the duplicate key, and the whole
 * digest vanished below the status line on remount. The same class waits in
 * the offers journal: append-only by design, so a second run the same day
 * re-offers overlapping documents.
 *
 * One page is one fact, whoever found it, however many times it was offered.
 */

const cand = (url: string, score: number, scoredOn: 'article' | 'abstract' = 'article'): ScoredCandidate => ({
  url,
  title: `T ${url}`,
  publishedAt: null,
  engine: 'fake',
  score,
  contribution: score,
  gate: 1,
  axes: [{ axis: 'relevance', kind: 'contribution', score, reason: 'fixture', ok: true }],
  degraded: false,
  ungatedAxes: [],
  failures: [],
  scoredOn
});

const report = (over: Partial<RetrievalReport>): RetrievalReport => ({
  query: 'q',
  digest: [],
  belowCut: [],
  triaged: [],
  unreadable: [],
  counts: { searched: 0, afterTriage: 0, fetched: 0, scored: 0 },
  ...over
});

const outcome = (reports: RetrievalReport[]): DigestOutcome => ({
  editorial: { digest: [], heldBack: [] },
  reports,
  editorRound: { issued: 0, notIssued: 0 },
  failedFunnels: []
});

test('two substrates reporting the same page yield one funnel fact, not two', () => {
  const shared = 'https://a.example/same';
  const out = toSessionReport(
    outcome([
      report({
        belowCut: [cand(shared, 55), cand('https://a.example/only-1', 40)],
        unreadable: ['https://a.example/dead'],
        triaged: [{ url: 'https://a.example/tr', title: 't', reason: 'no-title' }]
      }),
      report({
        belowCut: [cand(shared, 70)],
        unreadable: ['https://a.example/dead'],
        triaged: [{ url: 'https://a.example/tr', title: 't', reason: 'no-title' }]
      })
    ])
  );

  const urls = out.funnel.belowCut.map(b => b.url);
  assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs in belowCut');
  assert.equal(urls.filter(u => u === shared).length, 1);
  assert.equal(new Set(out.funnel.unreadable).size, out.funnel.unreadable.length, 'unreadable deduped');
  const triageKeys = out.funnel.triaged.map(t => `${t.reason}|${t.url}`);
  assert.equal(new Set(triageKeys).size, triageKeys.length, 'same page + same rule is one fact');
});

test('the page two substrates scored keeps its stronger reading', () => {
  const shared = 'https://a.example/same';
  const out = toSessionReport(
    outcome([report({ belowCut: [cand(shared, 55)] }), report({ belowCut: [cand(shared, 70)] })])
  );
  const entry = out.funnel.belowCut.find(b => b.url === shared);
  assert.equal(entry?.score, 70);
});

test('same page, different triage rules: two facts — the rules disagree, which is signal', () => {
  const out = toSessionReport(
    outcome([
      report({ triaged: [{ url: 'https://a.example/x', title: 't', reason: 'no-title' }] }),
      report({ triaged: [{ url: 'https://a.example/x', title: 't', reason: 'duplicate' }] })
    ])
  );
  assert.equal(out.funnel.triaged.length, 2);
});

test('scoredOn follows the pooled candidate — first substrate wins, matching the pool', () => {
  const shared = 'https://a.example/same';
  const out = toSessionReport(
    outcome([report({ belowCut: [cand(shared, 55, 'article')] }), report({ belowCut: [cand(shared, 70, 'abstract')] })])
  );
  const [id] = Object.keys(out.scoredOn);
  assert.equal(out.scoredOn[id], 'article', 'the label describes the candidate the pool kept');
});

test('a day with two runs shows the latest run only — the ceiling survives a re-run', () => {
  // Measured 2026-08-20: a 20:51 run and a 23:00 UTC run on the same date
  // displayed as one eight-entry digest. A day's digest is its most recent
  // run's selection, whole — never the union of the day's runs.
  const runTwo = '2026-08-19T23:00:44.104Z';
  const offers = [
    { documentId: 'doc_a', at: '2026-08-19T18:51:00.092Z' }, // run 1, pre-runAt
    { documentId: 'doc_b', at: '2026-08-19T18:51:00.092Z' },
    { documentId: 'doc_a', at: runTwo, runAt: runTwo }, // run 2 re-offers doc_a
    { documentId: 'doc_c', at: runTwo, runAt: runTwo },
    { documentId: 'doc_d', at: '2026-08-18T09:00:00.000Z' } // the day before
  ];
  const day = latestRunOffers(offers, '2026-08-19');
  assert.deepEqual(day.map(o => o.documentId).sort(), ['doc_a', 'doc_c'], 'latest run only, day-bounded');
});

test('offers written before runAt existed group by their shared at — a pre-migration run stays whole', () => {
  const offers = [
    { documentId: 'doc_a', at: '2026-08-19T18:51:00.092Z' },
    { documentId: 'doc_b', at: '2026-08-19T18:51:00.092Z' }
  ];
  assert.equal(latestRunOffers(offers, '2026-08-19').length, 2);
});

test('a document offered twice within the latest run is one entry — duplicate keys never reach a view', () => {
  const runAt = '2026-08-19T23:00:44.104Z';
  const offers = [
    { documentId: 'doc_a', at: runAt, runAt },
    { documentId: 'doc_a', at: runAt, runAt }
  ];
  assert.equal(latestRunOffers(offers, '2026-08-19').length, 1);
});
