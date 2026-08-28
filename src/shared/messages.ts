import type { Content } from '$core/index';
import type {
  PreferenceDoc,
  RankResult,
  Platform,
  EngagementKind,
  PrefOp,
  EvalLabelEntry
} from './types';

/**
 * The score path carries the full `Content` the engine scores. It used to carry
 * only `{id, authorName, text}`, which was enough for Relevance alone; the gate
 * axes judge construction and framing, so they need media types and posting
 * time too. Widening it here means no axis has to be shimmed at the boundary.
 */
export interface ScoreRequest {
  type: 'spotter:score';
  post: Content;
}

export type ScoreResponse =
  | { ok: true; result: RankResult }
  | { ok: false; error: string };

export interface ChatRequest {
  type: 'spotter:chat';
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
}

export type ChatResponse =
  | { ok: true; reply: string; ops: PrefOp[]; currentPrefs: PreferenceDoc }
  | { ok: false; error: string };

export interface LabelRequest {
  type: 'spotter:label';
  entry: EvalLabelEntry;
}

export type LabelResponse = { ok: true } | { ok: false; error: string };

// --- the digest path (v0.1) --------------------------------------------------
//
// A closed set, validated at the receiver: the background worker refuses any
// shape it does not know (§5.6 — enumerable by enforcement, not convention).

/** Tier 3 of §5.5 — the explicit "search now" control. */
export interface DigestRunRequest {
  type: 'spotter:digest-run';
}

/** The other half of the control: what was started can be stopped. */
export interface DigestCancelRequest {
  type: 'spotter:digest-cancel';
}

export interface DigestGetRequest {
  type: 'spotter:digest-get';
}

/** The reader opened an entry. Opening is not reading. */
export interface DigestOpenRequest {
  type: 'spotter:digest-open';
  documentId: string;
}

/** The reader marked it read — an explicit gesture, never a measurement. */
export interface DigestReadRequest {
  type: 'spotter:digest-read';
  documentId: string;
}

export interface DigestEntryView {
  documentId: string;
  url: string;
  title: string;
  score: number;
  reason: string;
  degraded: boolean;
  scoredOn: 'article' | 'abstract';
  axes: Array<{ axis: string; kind: string; score: number; reason: string; ok: boolean }>;
  engine: string;
  openedAt: string | null;
  readAt: string | null;
}

export interface HeldBackView {
  documentId: string;
  title: string;
  url: string;
  score: number;
  outcome: 'refused' | 'beaten' | 'unruled';
  /** The reason for a refusal — the interesting half (§5.6). */
  reason?: string;
  /** How narrowly a beaten item lost (§5.2, the fourth degree). */
  margin?: number | null;
}

/**
 * The whole funnel, visible (Céline, 2026-08-19): every stage's exclusions,
 * with motivation as fine as the examination that produced it. Coarse at the
 * top — a mechanical rule names itself; middle — the weakest axis with its
 * reason; bottom — the editor's own sentence per refusal. Session-class, like
 * the rest of the run report.
 */
export interface FunnelView {
  /** Stage 1 — mechanical triage. The rule is the whole motivation. */
  triaged: Array<{ url: string; title: string; reason: string }>;
  /** Stage 2 — survived triage, could not be read (and no usable abstract). */
  unreadable: string[];
  /**
   * Stage 3 — scored, below the funnel's cut. Motivation = the weakest axis
   * and its reason, plus the margin to the cut (§5.2 — the instrument is the
   * margin, not the rank).
   */
  belowCut: Array<{
    url: string;
    title: string;
    score: number;
    margin: number | null;
    weakestAxis: { axis: string; kind: string; score: number; reason: string } | null;
  }>;
  /** Stage 4 (future): the Crabe reliability stage — declared absent until the side channel exists. */
  crabeStage: 'not wired in v0.1';
  /**
   * Stage 0, in a sense: substrates whose whole funnel failed. Their
   * candidates are missing in a way nothing downstream can count (§5.2,
   * degree 1) — so the absence itself is carried to the surface. A night with
   * a dead substrate must not read as a thin day.
   */
  failedFunnels: Array<{ engine: string; query: string; error: string }>;
}

export interface DigestView {
  /** When the digest was produced, and by which tier — §5.5: say which one ran. */
  ranAt: string | null;
  ranBy: 'overnight' | 'staleness' | 'manual' | null;
  entries: DigestEntryView[];
  /**
   * Session-class (§6.3): survives worker restarts, dies with the browser.
   * After a browser restart the digest itself is rebuilt from the store; this
   * is empty and `heldBackLost` says so rather than pretending it was empty.
   */
  heldBack: HeldBackView[];
  heldBackLost: boolean;
  /** Funnel accounting for the run, same session class. */
  counts: { searched: number; afterTriage: number; fetched: number; scored: number } | null;
  /** The full cascade, same session class as `heldBack`. */
  funnel: FunnelView | null;
  /**
   * A run in progress right now, from the worker's own state — the witness
   * (Céline, 2026-08-19: a launched search must be visibly running). In-memory
   * on purpose: if the worker dies mid-run the run is dead with it, and a
   * stored flag would keep saying "searching" forever, which is worse than no
   * witness. Honest consequence: after a worker crash this reads not-running,
   * because nothing is running.
   */
  runInProgress: { startedAt: string; tier: 'overnight' | 'staleness' | 'manual' } | null;
  /**
   * The last run that failed, until a run succeeds or a new one starts. A
   * failure that lives only in the worker's console is invisible to the one
   * person who needs it — measured the hard way: every run died on a
   * disallowed dynamic import, silently, and the report was "the search does
   * not launch". Session-class: an error that happened does not lie, unlike a
   * stored "running" flag.
   */
  lastRunError: { at: string; tier: string; message: string } | null;
  /**
   * Who produced and served this view — §1 applied to our own plumbing: the
   * reader can always tell whether the extension or the companion is the
   * producer today. Absent (undefined) on views built before this field.
   */
  servedBy?: 'extension' | 'companion';
}

/** The user's declarations changed — push them to the companion if paired. */
export interface DeclarationsChangedRequest {
  type: 'spotter:declarations-changed';
}

/** What the push did — shown next to the save button, never swallowed. */
export type DeclarationsPushResponse =
  | { ok: true; pushed: boolean; detail: string }
  | { ok: false; error: string };

/** A past digest, rebuilt from the durable store: one day, its offers. */
export interface DigestDayRequest {
  type: 'spotter:digest-day';
  /** ISO date, `YYYY-MM-DD`. */
  day: string;
}
export interface DigestDaysRequest {
  type: 'spotter:digest-days';
}
export type DigestDaysResponse = { ok: true; days: string[] } | { ok: false; error: string };

export type DigestRunResponse = { ok: true; view: DigestView } | { ok: false; error: string };
/** `cancelling: false` = there was no run to stop — said, not swallowed. */
export type DigestCancelResponse = { ok: true; cancelling: boolean } | { ok: false; error: string };
export type DigestGetResponse = { ok: true; view: DigestView } | { ok: false; error: string };
export type GestureResponse = { ok: true } | { ok: false; error: string };

export interface LogRequest {
  type: 'spotter:log';
  post: {
    id: string;
    platform: Platform;
    authorHandle: string;
    authorName: string;
    text: string;
    mediaTypes: readonly string[];
  };
  rank: RankResult;
  engagement: readonly EngagementKind[];
  dwellMs: number | null;
  seenAt: string;
}
