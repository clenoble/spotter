import type { AxisId, AxisFailure, Platform } from '$core/index';

// The preference doc is a *user model* and `Platform` is a property of content,
// so both live in the core (spec §6). Re-exported here so host code that already
// imports them from `$shared` keeps working — and so the dependency runs one way
// only: hosts depend on core, core depends on nothing of theirs.
export type { PreferenceDoc, Platform } from '$core/index';

export interface RawPost {
  id: string;
  platform: Platform;
  authorHandle: string;
  authorName: string;
  text: string;
  mediaTypes: ReadonlyArray<'image' | 'video' | 'link' | 'document'>;
  postedAt: string | null;
  element: Element;
}

export interface PostSummary {
  topics: string[];
  tone: string;
  lengthClass: 'short' | 'medium' | 'long';
  kind: 'claim' | 'opinion' | 'story' | 'news' | 'promo' | 'other';
  language: string;
  customDimensions?: Record<string, string>;
}

export type EngagementKind =
  | 'click'
  | 'react'
  | 'comment'
  | 'share'
  | 'hide'
  | 'scroll-past'
  | 'dwell';

export interface EngagementEvent {
  postId: string;
  kind: EngagementKind;
  value?: number;
  at: string;
}

export interface ConsumptionLogEntry {
  postId: string;
  platform: Platform;
  authorHandle: string;
  seenAt: string;
  dwellMs: number | null;
  engagement: ReadonlyArray<EngagementKind>;
  summary: PostSummary;
  rankScore: number;
  rankReason: string;
  /**
   * Composition detail, so the dashboard can answer "show me what Spotter held
   * back, and why" (spec §1.1) from the log alone. Optional because entries
   * written before the gate axes landed don't carry it — they read back as
   * `undefined` and the aggregates skip them, no migration needed.
   *
   * This is metadata about the *judgment*, not about the reader: it records
   * what the system did to a post, not what the person did with it.
   */
  rankContribution?: number;
  rankGate?: number;
  rankAxes?: AxisTrace[];
  rankDegraded?: boolean;
}

/** One axis's verdict, flattened for transport and storage. */
export interface AxisTrace {
  axis: AxisId;
  kind: 'contribution' | 'gate';
  /** Contribution: 0..100. Gate: 0..1 multiplier. */
  score: number;
  reason: string;
  ok: boolean;
}

export interface RankResult {
  postId: string;
  /** Composed 0..100, after gates. What the badge shows and what sorts. */
  score: number;
  /** One line for the badge — the axis that decided the outcome. */
  reason: string;
  /** Weighted contribution before gates. */
  contribution: number;
  /** Product of the gate multipliers, 0..1. `1` = nothing demoted this. */
  gate: number;
  /** Every axis that ran, so the user can always ask *why* (Plan Visibility). */
  axes: AxisTrace[];
  /** At least one axis could not judge. Surfaced, never absorbed. */
  degraded: boolean;
  failures: AxisFailure[];
}

export type PrefListField =
  | 'topicsMore'
  | 'topicsLess'
  | 'tonePreferences'
  | 'authorsBoost'
  | 'authorsMute'
  | 'customRules';

export interface PrefOp {
  field: PrefListField;
  op: 'add' | 'remove';
  value: string;
}

// Eval corpus — the labeling path into `npm run eval`. Each entry is an
// explicit, per-post, user-initiated capture: the ONE sanctioned exception to
// the no-raw-text rule (see docs/privacy.md). Stored in its own object store;
// inspectable, deletable, exportable from the dashboard.
export type EvalBucket = 'clean' | 'borderline' | 'pollution';

export interface EvalLabelEntry {
  postId: string;
  platform: Platform;
  authorHandle: string;
  authorName: string;
  /** Raw post text — captured only at the moment the user rates the post. */
  text: string;
  axis: 'pollution';
  bucket: EvalBucket;
  /** Numeric label for the harness: clean=10, borderline=50, pollution=90. */
  value: number;
  labeledAt: string;
}

export type ChangelogStatus = 'pending' | 'accepted' | 'rejected';

export interface ModelChangelogEntry {
  id: string;
  createdAt: string;
  kind: 'implicit-learn' | 'chat-edit' | 'onboarding';
  observation: string;
  proposedChange: string;
  status: ChangelogStatus;
}
