import type { SearchQuery } from './search/adapter';

/**
 * The editor's own retrieval round — the second funnel (§5.6).
 *
 * The editor does not only choose among the day's candidates. On the basis of
 * them it **searches**: for a well-made contradiction, for the same subject at
 * a different altitude (§5.4), for whether a subject has moved since it was
 * last seen. It then arbitrates on the composed scores *together with* what
 * those queries returned. So the digest's cut happens after a round that can
 * **add** candidates, not only prune them.
 *
 * ## The constraint that shapes this file
 *
 * §5.6.1: a query may disclose a **subject**, never **the user**. *"Strong
 * arguments against carbon pricing"* is ordinary curiosity of the kind any
 * reader might type. *"Arguments against [this user's stated position]"* is the
 * stance model on the wire — and a query is **egress by construction**, so
 * there is no local-only form of it the way there is for scoring.
 *
 * **That distinction cannot be checked by inspecting a string.** No rule reads
 * a sentence and decides whether it encodes a person. So it is not checked: it
 * is made **unrepresentable**. The builder below is handed subjects and nothing
 * else — there is no parameter through which the stance model could arrive,
 * so no version of this code can put it in a query. Same gesture as the
 * `EditorView`: the capability is absent rather than forbidden.
 *
 * ## What is here and what is not
 *
 * Extracting a subject from a document is a judgment, so it is the model's, and
 * it happens before this file. What is here is the part that must be right by
 * construction rather than by prompting: the shape of a query, the intents that
 * may generate one, the budget, and the accounting.
 */

/**
 * Why the editor is asking. Each maps to a different question about a subject,
 * and **none of them is a question about the reader**.
 */
export type EditorialIntent =
  /** A well-made argument against the position a candidate takes. */
  | 'contradiction'
  /** The same subject treated with more rigour — toward the source (§5.4). */
  | 're-level-up'
  /** The same subject treated more accessibly. Must clear Crabe (§5.4 guard 3). */
  | 're-level-down'
  /** Has this subject moved since it was last seen? */
  | 'movement';

/**
 * A subject the editor may ask about — extracted from a candidate by the model.
 *
 * ⚠️ **This is the whole input surface of the query builder, and that is the
 * point.** It carries what a document is about and what it claims. It carries
 * nothing about the reader: no position, no cursor, no expertise level, no
 * reading history. A future field here is a decision to widen what can leave
 * the machine, and should be read as one.
 */
export interface CandidateSubject {
  /** Which candidate this was extracted from, so a query can be traced back. */
  readonly documentId: string;
  /** What the document is about, in the terms a stranger would use. */
  readonly subject: string;
  /** The position it takes, where it takes one — for `contradiction`. */
  readonly claim?: string;
}

export interface EditorialQuery {
  readonly intent: EditorialIntent;
  readonly query: SearchQuery;
  /** The candidate that prompted it — Plan Visibility for the second round. */
  readonly promptedBy: string;
  /** The subject disclosed by this query, in plain words, for the same reason. */
  readonly discloses: string;
}

export interface EditorialQueryPolicy {
  /**
   * Ceiling on queries per round. Every one is egress and a fetch budget, so
   * the number is a privacy setting as much as a cost setting.
   */
  readonly maxQueries: number;
  /** Which intents are enabled. Contradiction is the one a reader may not want. */
  readonly intents: readonly EditorialIntent[];
  /** Passed through to the substrate — §5.1's requirements bind this round too. */
  readonly language?: string;
}

export const DEFAULT_QUERY_POLICY: EditorialQueryPolicy = {
  maxQueries: 6,
  intents: ['contradiction', 're-level-up', 'movement'],
  language: undefined
};

/**
 * Build the round's queries from subjects.
 *
 * Pure, and deliberately dull. The judgment happened upstream when the subject
 * was extracted; what remains is a shape, and a shape is the sort of thing that
 * should be inspectable rather than generated.
 *
 * *`re-level-down` is not in the default policy: down-levelling moves toward
 * interpretation and can swap a rigorous finding for distorted spin, so §5.4
 * requires it to clear Crabe before being offered. Enabling it before that gate
 * exists would be shipping the risky direction first.*
 */
export function buildEditorialQueries(
  subjects: readonly CandidateSubject[],
  policy: EditorialQueryPolicy = DEFAULT_QUERY_POLICY
): { readonly issued: readonly EditorialQuery[]; readonly notIssued: number } {
  const all: EditorialQuery[] = [];

  for (const s of subjects) {
    for (const intent of policy.intents) {
      const q = phrase(intent, s);
      if (q) {
        all.push({
          intent,
          query: { q, language: policy.language },
          promptedBy: s.documentId,
          discloses: s.subject
        });
      }
    }
  }

  // ⚠️ Everything is built, *then* cut, so the cut can be counted. Returning
  // early at the ceiling would have been cheaper and would have made the budget
  // a **silent cap** — a shorter list with no account of what left, which is
  // the thing §1.1 refuses and which the first funnel already reports properly.
  // Caught while writing this file, not by a test, which is worth noting: the
  // efficient shape and the honest shape differed by one loop.
  return { issued: all.slice(0, policy.maxQueries), notIssued: Math.max(0, all.length - policy.maxQueries) };
}

/**
 * The wording, and it is where the egress rule becomes concrete.
 *
 * Every phrase below is about a **subject**. None can become about the reader,
 * because the reader is not among the inputs — `claim` is what *the document*
 * asserts, not what the user believes.
 */
function phrase(intent: EditorialIntent, s: CandidateSubject): string | null {
  switch (intent) {
    case 'contradiction':
      // Needs something to contradict. Without a claim there is no argument to
      // look for, and a query against a bare subject would just be more of it.
      return s.claim ? `strong arguments against ${s.claim}` : null;
    case 're-level-up':
      return `${s.subject} original research paper`;
    case 're-level-down':
      return `${s.subject} explained accessibly`;
    case 'movement':
      return `${s.subject} recent developments`;
  }
}

/**
 * The rule that makes a challenge usable rather than merely uncomfortable
 * (§5.6.1): **a challenger may be off on one axis at most.**
 *
 * A piece that contradicts the reader must still be relevant, well-calibrated,
 * substantive and clean. What is forbidden is the combination — off-topic *and*
 * over their head *and* thin *and* contrarian is not a challenge, it is noise
 * wearing the badge, and it is what a lazy challenge feature degenerates into
 * because anything at all can be justified as challenging.
 *
 * It is the calibration band applied to disagreement: **stretch on one
 * dimension while everything else stays comfortable**, or the reader has no
 * footing from which to engage. And it is mechanically checkable, which means
 * it can be enforced rather than merely intended.
 *
 * ⚠️ *Spec wording to tighten: §5.6.1 says "off on **one** axis, at most" in
 * prose and "**exactly** one axis below its threshold" in the mechanical
 * sentence. Implemented as **at most one**, because a piece off on no axis is
 * not unusable — it is a good item that happens to disagree, which is the best
 * kind. Surfaced here rather than resolved silently in code.*
 */
export function challengeIsUsable(
  axes: readonly { readonly axis: string; readonly score: number }[],
  thresholds: Readonly<Record<string, number>>
): { readonly usable: boolean; readonly below: readonly string[] } {
  const below = axes.filter(a => a.score < (thresholds[a.axis] ?? 0)).map(a => a.axis);
  return { usable: below.length <= 1, below };
}

/**
 * What the round did, kept **apart from the first funnel's report** (§5.2).
 *
 * The three degrees of invisibility apply to this round too: it has its own
 * substrate, its own budget and its own blind spots, and nothing the first
 * funnel's counters record says anything about them. One ladder per examiner —
 * a tidying remark until the editor started retrieving, and a requirement now.
 */
export interface EditorialRoundReport {
  readonly queries: readonly EditorialQuery[];
  /** Results found, before triage. */
  readonly found: number;
  /** Survived triage and were scored — the round's contribution to the slate. */
  readonly added: number;
  /** Queries the budget cut before they were issued. Reported, never silent. */
  readonly notIssued: number;
}
