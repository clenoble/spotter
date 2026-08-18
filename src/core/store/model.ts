/**
 * The storage model, shaped for Sovereign from the start.
 *
 * Read against the real `sovereign-db` schema (`crates/sovereign-db/src/schema.rs`)
 * rather than its description, and the fit is closer than expected. The aim is
 * **projectability**, not imitation: SurrealDB cannot run in an MV3 service
 * worker, so the store stays local, but the *shape* is a graph of nodes and
 * typed edges so that moving in later is a mapping rather than a redesign.
 *
 * ## What maps directly
 *
 * | Spotter            | Sovereign            | Note |
 * |--------------------|----------------------|------|
 * | `Topic`            | `Thread`             | project/topic grouping; same fields |
 * | `StoredDocument`   | `Document`           | `url` → `source_url`, already in their schema for web-fetched content |
 * | `isOwned: false`   | `Document.is_owned`  | the Sovereignty Halo: retrieved content is never the user's own |
 * | `Relation`         | `RelatedTo`          | typed edge with `strength` and `created_at` |
 * | `'contradicts'`    | `RelationType::Contradicts` | **native** — the challenge relation already exists there |
 * | `deletedAt`        | `deleted_at`         | soft delete, their convention |
 * | `modifiedAt`       | `modified_at`        | last-writer-wins on cross-device sync |
 *
 * Two conventions borrowed deliberately. **Soft delete** rather than removal,
 * because a row deleted on one device must not be resurrected by a peer that
 * never saw the deletion. And **field-level separation** of anything sensitive:
 * Sovereign encrypts per field with its own nonce (`encryption_nonce`,
 * `title_nonce`) and keeps blind-index token hashes for search, so text that
 * will one day be encrypted must live in its own field rather than inside a
 * blob.
 *
 * ## Where it does not map, stated rather than fudged
 *
 * - **The judgment has no home there.** Sovereign carries Crabe's verdict as
 *   fields on the document (`reliability_score`, `reliability_assessment`,
 *   `assessed_at`). Ours is a different judgment and would want the same
 *   treatment — a symmetric `attention_*` set. That is a request to make of the
 *   Sovereign node, not something to assume.
 * - **The journals have no relation type.** `proposed` and `read` are edges
 *   from the reader to a document, and `RelationType` has no such member. Kept
 *   as our own edge kind, and flagged.
 */

import type { AxisTrace } from './judgment';

export type { AxisTrace };

/** → Sovereign `Thread`. A subject the reader follows; the unit queries are built from. */
export interface Topic {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
  /** ISO 8601. Non-null means deleted — never removed outright (see above). */
  deletedAt: string | null;
}

/** → Sovereign `Document`. One retrieved page, paper or article. */
export interface StoredDocument {
  /** Stable and derived from the cleaned URL, so the same page is one node. */
  id: string;
  /** → `source_url`. */
  url: string;
  title: string;
  /** → `thread_id`. */
  topicId: string | null;
  /**
   * → `is_owned`. Always false for retrieved content: this is somebody else's
   * writing, and the Sovereignty Halo exists to keep that visible.
   */
  isOwned: boolean;
  /**
   * When **Spotter** first found it. Always available, always ours.
   *
   * This is what the editorial pass (§5.6) reasons about — not the publication
   * date. Measured on a live instance, the self-hosted substrate supplies no
   * dates at all, so a design resting on `publishedAt` would have been weakest
   * on exactly the path that is the protective default. And it is the better
   * question anyway: *has this subject crossed my desk lately* is about our own
   * timeline, not the document's.
   */
  firstFoundAt: string;
  /**
   * The provider's publication date where one exists — OpenAlex and Brave give
   * one, SearXNG does not. Kept because it is real information when present,
   * and because "published in 2019, found today" is a distinction the editorial
   * pass may want. Never depended on, since it is absent on a whole substrate.
   */
  publishedAt: string | null;
  /** Journal, publisher or site — the fact that discriminates on recent work. */
  venue: string | null;
  /** Which adapter found it. */
  engine: string;
  /**
   * What the reader did with it — carried **on the document**, per Céline's
   * ruling, with no reader→document edge and no separate event stream.
   *
   * Nested here for legibility; it flattens to sibling columns when projected
   * into Sovereign, where `Document` would carry them alongside the existing
   * `reliability_*` set.
   */
  signals: ReadingSignals;
  deletedAt: string | null;
}

/** → Sovereign `RelatedTo`. `contradicts` and `supports` are native there. */
export type RelationType = 'contradicts' | 'supports' | 'references' | 'derivedfrom';

export interface Relation {
  fromId: string;
  toId: string;
  type: RelationType;
  strength: number;
  createdAt: string;
}

/**
 * Which install produced a record. Céline's rule (2026-08-04): **entries are
 * recorded per surface**, everywhere, not as a patch on one counter.
 *
 * It is the *host*, not the installation. A per-install id would be a stable
 * device identifier, and this project does not mint one of those without a
 * verified need — the two things that actually need this field are satisfied by
 * the host alone. Merge (§6.4) needs to know which entries came from where; the
 * plumbing counter (§5.2) must not average "this domain blocks our fetcher"
 * across hosts whose permissions and network differ.
 */
export type Surface = 'chrome' | 'firefox' | 'sovereign';

/**
 * The journal of **offers** — what *Spotter* did. Append-only.
 *
 * An earlier draft had two journals, *proposed* and *read*, and a later ruling
 * put reading signals on the document instead; that read like a contradiction
 * needing an arbiter. It is not. The two objects answer to **two different
 * actors**, and once that is seen the redundancy dissolves rather than needing
 * a winner: Spotter offers (here), the reader acts (`ReadingSignals`, below).
 *
 * Append-only because a journal that can be edited is not a journal — and
 * because **repetition is native** here, which a single timestamp cannot
 * express. Offered three times on three days is three rows.
 *
 * *Append-only bounds editing, not lifetime.* The horizon is 12 months
 * (`JOURNAL_HORIZON_DAYS`): "this subject has been absent two months" needs
 * months, "this repeats something from two years ago" is not an editorial
 * question, and an offer log with no horizon would harden the reject side
 * (§5.2, 30 days) while letting the offer side run forever.
 */
export interface JournalEntry {
  documentId: string;
  /** The subject this was offered under — what `subjectLastSeen` groups on. */
  topicId: string | null;
  at: string;
  surface: Surface;
  /** True when offered as a labelled challenge (§5.6.1). */
  challenge?: boolean;
}

/** 12 months. See `JournalEntry`. */
export const JOURNAL_HORIZON_DAYS = 365;

/**
 * What the reader did with a document — carried **on the document**, not as a
 * status enum and not as a reader→document edge (Céline's ruling, 2026-08-04).
 *
 * **Timestamps rather than a status**, because an enum is a state machine and a
 * state machine destroys the two things that carry signal: *repetition* — read
 * three times is stronger than read once — and *chronology* — proposed on the
 * 1st, read on the 9th, and the gap says something. The status is read off
 * whichever field is furthest along.
 *
 * ⚠️ **`readAt` is set by an explicit gesture of the reader. Never by a timer,
 * a scroll position, or a dwell measurement.** This corrects an earlier version
 * of §5.6.1 which proposed measuring depth of reading: the observation that
 * clicking is not reading was right, reaching for instrumentation to close the
 * gap was not. The argument that settles it is re-pointability — *a stopwatch
 * running on whatever is on screen serves the mirror, and would serve anything
 * else just as well; a "read" gesture re-points at nothing.* It is the same
 * test applied to search engines and to dual-use elsewhere in this project,
 * which I had been applying to other people's tools and not to my own.
 *
 * It also serves the reader directly: she remembers what she has read.
 */
export interface ReadingSignals {
  /**
   * Earliest offer, or null while the document has been found but never
   * offered — which is most of the haul, so it is not an edge case.
   *
   * A **cache** of the journal's first entry, not a second source of truth. It
   * is only writable through `recordOffer`, which appends the journal row in
   * the same gesture, so the two cannot drift apart. And it is safe as a cache
   * precisely because journal entries carry their surface (§6.4): nothing has
   * to be reconciled across hosts.
   */
  proposedAt: string | null;
  /** The reader opened it. Opening is not reading. */
  openedAt: string | null;
  /** Number of times opened — repetition is signal, so it is not collapsed. */
  openCount: number;
  /** The reader marked it read. An explicit gesture, always. */
  readAt: string | null;
  /** Most recent explicit read mark, when marked more than once. */
  lastReadAt: string | null;
}

export function emptySignals(): ReadingSignals {
  return { proposedAt: null, openedAt: null, openCount: 0, readAt: null, lastReadAt: null };
}

/**
 * A document as a caller may write it. **Signals are absent by type**, because
 * they are not the caller's to set: they are derived from events, through
 * `recordOffer` / `recordOpen` / `recordRead`.
 *
 * This is a barrier rather than a convention. Were signals writable here, a
 * re-score calling `putDocument` would silently clobber the reader's history —
 * a bug that fails quietly and in the direction that looks like nothing
 * happened.
 */
export type DocumentInput = Omit<StoredDocument, 'signals'>;

/**
 * Combine two sets of signals for the same document.
 *
 * **This is one function doing two jobs on purpose**, because they are the same
 * rules: recording a new event locally, and merging bases across a user's
 * installs (§6.4). Writing them twice would be writing them differently
 * eventually — and "additive" declines differently per field, which is exactly
 * the kind of divergence that fails silently.
 *
 * - first-time facts (`proposedAt`, `openedAt`, `readAt`) take the **earliest**
 * - `lastReadAt` takes the **latest**
 * - `openCount` is **summed** — twice on Chrome and once in Sovereign is three
 */
export function mergeSignals(a: ReadingSignals, b: ReadingSignals): ReadingSignals {
  return {
    proposedAt: earliest(a.proposedAt, b.proposedAt),
    openedAt: earliest(a.openedAt, b.openedAt),
    openCount: a.openCount + b.openCount,
    readAt: earliest(a.readAt, b.readAt),
    lastReadAt: latest(a.lastReadAt, b.lastReadAt)
  };
}

function earliest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}
