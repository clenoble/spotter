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
}

export type DigestRunResponse = { ok: true; view: DigestView } | { ok: false; error: string };
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
