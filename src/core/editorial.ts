import type { EditorView } from './store/store';

/**
 * The editorial pass — a librarian, not a ranker (§5.6).
 *
 * Everything upstream scores an item **in isolation**: the axes judge one
 * document against the user model, composition turns that into a number.
 * Ranking those numbers gives an ordered list, and an ordered list is not yet a
 * day's reading.
 *
 * So the funnel's output goes through a second judgment asking a different
 * question — *given everything already put in front of you, and everything you
 * actually read, does this earn a slot this morning?* Two things follow that no
 * per-item score can express: a superb article whose substance repeats one from
 * two days ago does not run, and a middling one whose subject has been absent
 * two months can be raised. **Absence is a reason**, and nothing in a composed
 * score can see it, because the score never looks at the calendar.
 *
 * ## What is here, and what is deliberately not
 *
 * This module owns the **assembly**: turning the editor's decisions into a
 * digest and a held-back list while enforcing the properties §1.1 requires.
 * Those properties are enforced *here*, in arithmetic, rather than asked of the
 * model — a judge that is trusted to account for everything it saw will one day
 * quietly drop something, and the loss would be invisible by construction.
 *
 * The editor's **own queries** (§5.6) — the second retrieval round it runs off
 * the day's candidates — are not in this file. That is a second funnel with its
 * own substrate, budget and blind spots, and folding it in here would make one
 * untestable lump of two separable things.
 */

/** What the funnel hands the editor about one surviving candidate. */
export interface EditorialCandidate {
  readonly documentId: string;
  readonly url: string;
  readonly title: string;
  readonly topicId: string | null;
  /** Composed 0..100, after gates. */
  readonly score: number;
  /** At least one axis could not judge — declared by the judge (§6.2). */
  readonly degraded: boolean;
  /** Gate axes that did not run, by name. The editor's business, not ours (F13). */
  readonly ungatedAxes: readonly string[];
}

/**
 * What happened to a candidate. **Four outcomes, not two**, and the distinctions
 * are the point.
 *
 * *Refused* and *beaten* were one thing until the Sovereign instance asked
 * whether "declined by the editor" covered losing a place. It does not: a
 * refusal is an act with a reason, being beaten is arithmetic. Recording a
 * beaten item as refused would invent a judgment nobody made.
 *
 * *Unruled* exists because the editor is a language model and may simply not
 * mention a candidate. Folding that into *beaten* would be the same invention
 * one layer down — `not_run ≠ zero`, on a verdict.
 */
export type EditorialOutcome =
  | { readonly kind: 'selected'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'beaten'; readonly margin: number | null }
  | { readonly kind: 'unruled' };

export interface EditorialEntry {
  readonly candidate: EditorialCandidate;
  readonly outcome: EditorialOutcome;
}

/** One verdict from the editor, before assembly checks it. */
export interface EditorialDecision {
  readonly documentId: string;
  readonly select: boolean;
  /** Required when refusing: *why* is the interesting half (§5.6). */
  readonly reason?: string;
  /**
   * What the piece is about, in the editor's own few words — the gesture
   * `enforceOneSlotPerSubject` makes unavoidable. The judge names the subject
   * because the schema requires it; the *rule* (one selection per subject)
   * runs in code, never in the prompt.
   */
  readonly subject?: string;
}

export interface EditorialResult {
  /** What the reader is shown. **At most** `maxItems` — a ceiling, never a quota. */
  readonly digest: readonly EditorialEntry[];
  /** Everything else, with what happened to it. Nothing is dropped (§1.1). */
  readonly heldBack: readonly EditorialEntry[];
}

/**
 * Facts about a candidate that only the journals can supply — the editor's
 * whole reason for existing, and all it is allowed to see.
 *
 * It reaches these through an `EditorView`, never the store: the join between
 * offers and reading signals is the comfort-filter trap (§5.6), and a rule in a
 * document is a discipline that falls in one commit.
 */
export interface EditorialContext {
  readonly documentId: string;
  readonly everProposed: boolean;
  readonly lastProposedAt: string | null;
  readonly subjectLastSeen: string | null;
}

export async function gatherContext(
  view: EditorView,
  candidates: readonly EditorialCandidate[]
): Promise<EditorialContext[]> {
  return Promise.all(
    candidates.map(async c => ({
      documentId: c.documentId,
      everProposed: await view.everProposed(c.documentId),
      lastProposedAt: await view.lastProposedAt(c.documentId),
      subjectLastSeen: c.topicId ? await view.subjectLastSeen(c.topicId) : null
    }))
  );
}

/**
 * One selection per subject, enforced in code — the diversity duty the prompt
 * cannot hold.
 *
 * Measured 2026-08-20, first overnight-shaped run: the judge selected FOUR
 * pieces on Hegel's Elements of the Philosophy of Right and numbered them
 * "first piece … fourth piece" — while refusing others for "redundancy with
 * the selection". The instruction existed; nothing triggered it. Same lesson
 * as the forced refusal calls: *an instruction whose execution depends on a
 * decision does not execute* — so the decision is taken out of the prompt.
 * The judge names each selection's subject (schema-required); this function
 * groups selections by normalized subject — falling back to the candidate's
 * title, which also catches page-per-chapter floods — keeps the strongest of
 * each group, and flips the rest to `refused` with a reason that says the
 * rule, mechanically. No motivation call needed: the reason is the rule.
 */
export function enforceOneSlotPerSubject(
  candidates: readonly EditorialCandidate[],
  decisions: readonly EditorialDecision[]
): EditorialDecision[] {
  const byId = new Map(candidates.map(c => [c.documentId, c]));
  const groups: Array<{ key: string; members: Array<{ d: EditorialDecision; score: number; title: string }> }> = [];

  for (const d of decisions) {
    const c = byId.get(d.documentId);
    if (!d.select || !c) continue;
    const key = normalizeSubject(d.subject?.trim() || c.title);
    // Containment only counts on long keys: "democracy" must not swallow
    // "modernization, cultural change and democracy".
    const group = groups.find(
      g => g.key === key || (key.length >= 20 && g.key.length >= 20 && (g.key.includes(key) || key.includes(g.key)))
    );
    if (group) group.members.push({ d, score: c.score, title: c.title });
    else groups.push({ key, members: [{ d, score: c.score, title: c.title }] });
  }

  const flips = new Map<string, EditorialDecision>();
  for (const g of groups) {
    g.members.sort((a, b) => b.score - a.score);
    const [winner, ...losers] = g.members;
    for (const l of losers) {
      flips.set(l.d.documentId, {
        documentId: l.d.documentId,
        select: false,
        reason: `same subject as "${winner.title.slice(0, 80)}" — one slot per subject`,
        subject: l.d.subject
      });
    }
  }
  return decisions.map(d => flips.get(d.documentId) ?? d);
}

function normalizeSubject(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Turn the editor's decisions into a result, enforcing what §1.1 requires.
 *
 * Three properties, none of them asked of the model:
 *
 * 1. **Every candidate appears exactly once.** A judge trusted to account for
 *    what it saw will eventually drop one, and the loss would be undetectable.
 * 2. **A selection beyond the ceiling is *beaten*, not silently truncated.** If
 *    the editor picks seven and the ceiling is five, two lost their slot —
 *    that is a real outcome with a margin, not a list that got shorter.
 * 3. **The ceiling is never a quota.** Nothing is promoted to fill it. Padding
 *    with the least-bad remainder teaches the reader that the length means
 *    nothing, which is the *paradoxe addictif* re-entering through the count.
 */
export function assembleEditorial(
  candidates: readonly EditorialCandidate[],
  decisions: readonly EditorialDecision[],
  maxItems: number
): EditorialResult {
  const byId = new Map(decisions.map(d => [d.documentId, d]));

  // Selection order is the editor's ranking where it selected, tie-broken by
  // score — the editor decides *whether*, the score decides *which of two it
  // wanted equally*.
  const selected = candidates
    .filter(c => byId.get(c.documentId)?.select)
    .sort((a, b) => b.score - a.score);

  const kept = selected.slice(0, maxItems);
  const overflow = new Set(selected.slice(maxItems).map(c => c.documentId));
  const cut = kept.length ? kept[kept.length - 1].score : null;

  const digest: EditorialEntry[] = [];
  const heldBack: EditorialEntry[] = [];

  for (const candidate of candidates) {
    const decision = byId.get(candidate.documentId);

    if (!decision) {
      // The editor returned nothing about this one. We do not know what it
      // thought, so we do not write down a thought.
      heldBack.push({ candidate, outcome: { kind: 'unruled' } });
      continue;
    }

    if (decision.select && !overflow.has(candidate.documentId)) {
      digest.push({
        candidate,
        outcome: { kind: 'selected', reason: decision.reason ?? '' }
      });
      continue;
    }

    if (decision.select) {
      // Selected but beyond the ceiling: beaten by better company, which is not
      // the same as having been declined.
      heldBack.push({ candidate, outcome: { kind: 'beaten', margin: marginOf(candidate, cut) } });
      continue;
    }

    if (decision.reason) {
      heldBack.push({ candidate, outcome: { kind: 'refused', reason: decision.reason } });
    } else {
      // Not selected and no reason given. Calling that a refusal would attribute
      // a judgment to the editor that it did not express.
      heldBack.push({ candidate, outcome: { kind: 'beaten', margin: marginOf(candidate, cut) } });
    }
  }

  return { digest, heldBack };
}

/**
 * How narrowly it lost — **the instrument, where rank is not**.
 *
 * *Sixth every night* is not an anomaly in itself: a source can be
 * solid-without-being-first, and ranking it sixth is then correct. What carries
 * signal is the size of the gap. Sixth by two hundredths, repeatedly, is being
 * cut by noise; sixth by fifteen points is a judgment that holds.
 *
 * `null` when nothing was selected — there is no cut to have fallen below, and
 * inventing a distance from an empty digest would be worse than saying so.
 */
function marginOf(candidate: EditorialCandidate, cut: number | null): number | null {
  return cut === null ? null : Number((cut - candidate.score).toFixed(4));
}

/**
 * Candidates the editor let through **without a gate having run** (F13).
 *
 * Kept as a query rather than a rule: whether an unchecked item deserves a slot
 * depends on what else was competing, which no per-item rule can see. This
 * reports what happened so the *Held back* surface and the mirror can show it —
 * it does not adjudicate.
 */
export function surfacedUngated(result: EditorialResult): readonly EditorialEntry[] {
  return result.digest.filter(e => e.candidate.degraded || e.candidate.ungatedAxes.length > 0);
}
