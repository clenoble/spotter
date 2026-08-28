import type { AxisTrace, ConsumptionLogEntry, PostSummary } from '$shared/types';

export interface TopicCount {
  topic: string;
  count: number;
}

export interface KindCount {
  kind: PostSummary['kind'];
  count: number;
}

export interface AuthorCount {
  handle: string;
  name: string;
  count: number;
}

export interface ScoreHistogram {
  bucket: string;
  count: number;
  lo: number;
  hi: number;
}

const startOfDayISO = (): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function countToday(entries: readonly ConsumptionLogEntry[]): number {
  const since = startOfDayISO();
  return entries.filter(e => e.seenAt >= since).length;
}

export function averageScore(entries: readonly ConsumptionLogEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((acc, e) => acc + e.rankScore, 0) / entries.length;
}

export function topTopics(
  entries: readonly ConsumptionLogEntry[],
  limit = 10
): TopicCount[] {
  const m = new Map<string, number>();
  for (const e of entries) {
    for (const raw of e.summary.topics) {
      const topic = raw.toLowerCase().trim();
      if (!topic) continue;
      m.set(topic, (m.get(topic) ?? 0) + 1);
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic, count }));
}

export function kindBreakdown(entries: readonly ConsumptionLogEntry[]): KindCount[] {
  const m = new Map<PostSummary['kind'], number>();
  for (const e of entries) m.set(e.summary.kind, (m.get(e.summary.kind) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, count }));
}

export function topAuthors(
  entries: readonly ConsumptionLogEntry[],
  limit = 8
): AuthorCount[] {
  const m = new Map<string, { name: string; count: number }>();
  for (const e of entries) {
    const existing = m.get(e.authorHandle);
    if (existing) existing.count++;
    else m.set(e.authorHandle, { name: e.authorHandle, count: 1 });
  }
  return [...m.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([handle, v]) => ({ handle, name: v.name, count: v.count }));
}

export interface HeldBackItem {
  postId: string;
  authorHandle: string;
  seenAt: string;
  /** Score the contribution axes gave it, before any gate. */
  before: number;
  /** Score after the gates multiplied in. */
  after: number;
  /** Product of gate multipliers, 0..1. */
  gate: number;
  /** Only the gates that actually demoted, worst first. */
  demotedBy: AxisTrace[];
  topics: string[];
}

/**
 * "Show me what Spotter held back, and why" — the answer to spec §1.1. Nothing
 * is hidden today (the feed is reordered, never stripped), so *held back* means
 * *demoted*: this lists every post a gate pushed down, what it was worth before,
 * and which gate did it. Sorted by how much attention was taken away.
 */
export function heldBack(
  entries: readonly ConsumptionLogEntry[],
  limit = 50
): HeldBackItem[] {
  const items: HeldBackItem[] = [];
  for (const e of entries) {
    const gate = e.rankGate;
    if (gate === undefined || gate >= 0.999) continue;
    const before = e.rankContribution ?? e.rankScore;
    items.push({
      postId: e.postId,
      authorHandle: e.authorHandle,
      seenAt: e.seenAt,
      before,
      after: e.rankScore,
      gate,
      demotedBy: (e.rankAxes ?? [])
        .filter(a => a.kind === 'gate' && a.score < 0.999)
        .sort((a, b) => a.score - b.score),
      topics: e.summary.topics
    });
  }
  return items.sort((a, b) => b.before - b.after - (a.before - a.after)).slice(0, limit);
}

/**
 * Entries scored while at least one axis was failing. Counted separately from
 * everything else because a degraded score is not a low score — it is an
 * absent judgment, and conflating the two is how a broken axis stays invisible.
 */
export function degradedEntries(
  entries: readonly ConsumptionLogEntry[]
): ConsumptionLogEntry[] {
  return entries.filter(e => e.rankDegraded === true);
}

/** Entries predating the gate axes, which carry no composition detail. */
export function ungatedCount(entries: readonly ConsumptionLogEntry[]): number {
  return entries.filter(e => e.rankGate === undefined).length;
}

export function scoreHistogram(
  entries: readonly ConsumptionLogEntry[]
): ScoreHistogram[] {
  const buckets: ScoreHistogram[] = [
    { bucket: '0–20', count: 0, lo: 0, hi: 20 },
    { bucket: '20–40', count: 0, lo: 20, hi: 40 },
    { bucket: '40–60', count: 0, lo: 40, hi: 60 },
    { bucket: '60–80', count: 0, lo: 60, hi: 80 },
    { bucket: '80–100', count: 0, lo: 80, hi: 100 }
  ];
  for (const e of entries) {
    const b =
      buckets.find(x => e.rankScore >= x.lo && e.rankScore < x.hi) ??
      buckets[buckets.length - 1];
    b.count++;
  }
  return buckets;
}
