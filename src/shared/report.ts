import { documentIdFor, cleanUrl, type DigestOutcome } from '$core/index';
import type { HeldBackView, FunnelView } from './messages';

/**
 * Build the session-class run report from a digest outcome — shared by every
 * host that produces (browser extension, companion, later Sovereign).
 *
 * Extracted the day the second producer appeared: two hand-maintained copies
 * of this logic is how one host's funnel view silently stops matching the
 * other's — a guarantee declared on one side and absent on the other, in host
 * form. Pure over core types; the host only decides where the result lives
 * (storage.session, process memory) and for how long.
 */
export interface SessionReport {
  heldBack: HeldBackView[];
  reasons: Record<string, string>;
  scoredOn: Record<string, 'article' | 'abstract'>;
  counts: { searched: number; afterTriage: number; fetched: number; scored: number };
  funnel: FunnelView;
}

export function toSessionReport(outcome: DigestOutcome): SessionReport {
  const reasons: Record<string, string> = {};
  const scoredOn: Record<string, 'article' | 'abstract'> = {};
  for (const e of outcome.editorial.digest) {
    if (e.outcome.kind === 'selected') reasons[e.candidate.documentId] = e.outcome.reason;
  }
  for (const r of outcome.reports) {
    for (const s of [...r.digest, ...r.belowCut]) {
      const id = documentIdFor(cleanUrl(s.url));
      // First wins, matching the orchestrator's pool: when two substrates
      // scored the same page, the pooled candidate — the one the slate and the
      // store carry — is the first seen, so its label is the honest one.
      if (!(id in scoredOn)) scoredOn[id] = s.scoredOn;
    }
  }

  const heldBack: HeldBackView[] = outcome.editorial.heldBack.map(e => ({
    documentId: e.candidate.documentId,
    title: e.candidate.title,
    url: e.candidate.url,
    score: e.candidate.score,
    outcome: e.outcome.kind === 'refused' ? 'refused' : e.outcome.kind === 'beaten' ? 'beaten' : 'unruled',
    reason: e.outcome.kind === 'refused' ? e.outcome.reason : undefined,
    margin: e.outcome.kind === 'beaten' ? e.outcome.margin : undefined
  }));

  const counts = outcome.reports.reduce(
    (acc, r) => ({
      searched: acc.searched + r.counts.searched,
      afterTriage: acc.afterTriage + r.counts.afterTriage,
      fetched: acc.fetched + r.counts.fetched,
      scored: acc.scored + r.counts.scored
    }),
    { searched: 0, afterTriage: 0, fetched: 0, scored: 0 }
  );

  return { heldBack, reasons, scoredOn, counts, funnel: toFunnelView(outcome) };
}

/**
 * The whole cascade, motivation as fine as the examination that produced it
 * (§5.2 and Céline's ruling of 2026-08-19): a triage rule names itself; below
 * the cut the weakest axis speaks, with the margin; the editor's sentences
 * live in `heldBack`. Slate candidates are excluded here — their account is
 * the editor's.
 */
function toFunnelView(outcome: DigestOutcome): FunnelView {
  const slateIds = new Set([
    ...outcome.editorial.digest.map(e => e.candidate.documentId),
    ...outcome.editorial.heldBack.map(e => e.candidate.documentId)
  ]);

  // The funnels report independently, and two substrates finding the same page
  // is normal — measured 2026-08-19: SearXNG and OpenAlex both returned three
  // of the same URLs, so the merged `belowCut` carried them twice. One page is
  // one fact, whoever found it: without this, the duplicate keys killed the
  // dashboard's keyed each blocks and the whole digest vanished on remount.
  const triaged: FunnelView['triaged'] = [];
  const seenTriage = new Set<string>();
  const unreadable = new Set<string>();
  const belowCutRaw: Array<FunnelView['belowCut'][number] & { id: string }> = [];

  for (const r of outcome.reports) {
    for (const t of r.triaged) {
      // Same page, same rule, two substrates: one fact. Same page under two
      // different rules stays two facts — the rules disagree, which is signal.
      const key = `${String(t.reason)}|${t.url}`;
      if (seenTriage.has(key)) continue;
      seenTriage.add(key);
      triaged.push({ url: t.url, title: t.title, reason: String(t.reason) });
    }
    for (const u of r.unreadable) unreadable.add(u);

    const cut = r.digest.length ? r.digest[r.digest.length - 1].score : null;
    for (const s of [...r.digest, ...r.belowCut]) {
      const id = documentIdFor(cleanUrl(s.url));
      if (slateIds.has(id)) continue;
      belowCutRaw.push({
        id,
        url: s.url,
        title: s.title,
        score: s.score,
        margin: cut === null ? null : Number((cut - s.score).toFixed(1)),
        weakestAxis: weakestAxisOf(s.axes)
      });
    }
  }
  // Highest score first, then first-seen per document: a page two substrates
  // scored keeps its stronger reading, with that reading's own margin.
  belowCutRaw.sort((a, b) => b.score - a.score);
  const seenBelow = new Set<string>();
  const belowCut: FunnelView['belowCut'] = [];
  for (const { id, ...b } of belowCutRaw) {
    if (seenBelow.has(id)) continue;
    seenBelow.add(id);
    belowCut.push(b);
  }
  return {
    triaged,
    unreadable: [...unreadable],
    belowCut: belowCut.slice(0, 60),
    crabeStage: 'not wired in v0.1',
    failedFunnels: outcome.failedFunnels
  };
}

/**
 * The digest a day view shows: **the latest run of that day**, one entry per
 * document — shared by every read model (browser host, companion, later
 * Sovereign), because both defects it prevents are symmetrical.
 *
 * The offers journal is append-only (repetition is the signal, §6.2), so a
 * naive day view has two failure modes, both measured on 2026-08-19/20:
 * a second run the same day re-offers overlapping documents (duplicate keys —
 * the crash that emptied the dashboard), and a second run *unions* with the
 * first (a 20:51 run + a 23:00 UTC run displayed as one eight-entry digest —
 * the at-most-5 ceiling silently broken on screen). The digest is a finite
 * editorial act: a day's digest is its most recent run's selection, whole.
 * Earlier runs of the day stay in the journal, undisplayed.
 *
 * Offers written before `runAt` existed group by exact `at` — those runs wrote
 * one shared timestamp across all their offers, so the fallback is faithful.
 */
export function latestRunOffers<T extends { documentId: string; at: string; runAt?: string }>(
  offers: readonly T[],
  day: string
): T[] {
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;
  const inDay = offers.filter(o => o.at >= dayStart && o.at <= dayEnd);
  if (!inDay.length) return [];

  const runKey = (o: T) => o.runAt ?? o.at;
  const latest = inDay.map(runKey).reduce((a, b) => (a > b ? a : b));
  const ofRun = inDay.filter(o => runKey(o) === latest);

  ofRun.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const o of ofRun) {
    if (seen.has(o.documentId)) continue;
    seen.add(o.documentId);
    out.push(o);
  }
  return out;
}

/**
 * Which axis demoted hardest — gates on their multiplier, contributions on
 * their normalized score. A display heuristic, not a judgment record.
 */
function weakestAxisOf(
  axes: Array<{ axis: string; kind: string; score: number; reason: string; ok: boolean }>
): FunnelView['belowCut'][number]['weakestAxis'] {
  let weakest: (typeof axes)[number] | null = null;
  let worst = Infinity;
  for (const a of axes) {
    if (!a.ok) continue;
    const normalized = a.kind === 'gate' ? a.score : a.score / 100;
    if (normalized < worst) {
      worst = normalized;
      weakest = a;
    }
  }
  return weakest ? { axis: weakest.axis, kind: weakest.kind, score: weakest.score, reason: weakest.reason } : null;
}
