import type { Judgment } from './judgment';
import {
  emptySignals,
  mergeSignals,
  type DocumentInput,
  type JournalEntry,
  type ReadingSignals,
  type Relation,
  type StoredDocument,
  type Surface,
  type Topic
} from './model';

/**
 * The storage boundary (spec §6: *IndexedDB now, SurrealDB via `sovereign-db`
 * later, behind one interface*). Deliberately narrow — every method here is
 * something the engine or the editorial pass actually needs, so a second
 * implementation is a day's work rather than a project.
 *
 * Soft deletes are the store's business, not the caller's: readers never see
 * deleted rows, and nothing here offers a hard delete. Undeleting is possible;
 * resurrecting a row a peer deleted is not.
 *
 * **Reading signals are not writable directly.** `putDocument` takes a
 * `DocumentInput`, which has no `signals` field, and the three `record*`
 * methods are the only way they move. See `DocumentInput` for why that is a
 * type and not a rule in a comment.
 */
export interface SpotterStore {
  putTopic(topic: Topic): Promise<void>;
  listTopics(): Promise<Topic[]>;

  /** Signals are preserved across re-writes — they are not in `DocumentInput`. */
  putDocument(doc: DocumentInput): Promise<void>;
  getDocument(id: string): Promise<StoredDocument | null>;
  /** Soft delete — sets `deletedAt`, keeps the row. */
  removeDocument(id: string, at: string): Promise<void>;

  putJudgment(judgment: Judgment): Promise<void>;
  getJudgment(documentId: string): Promise<Judgment | null>;

  putRelation(relation: Relation): Promise<void>;
  relationsFrom(documentId: string): Promise<Relation[]>;

  /**
   * Offer a document: appends the journal row **and** advances `proposedAt` in
   * one gesture, so the cache cannot drift from the journal it caches.
   */
  recordOffer(entry: JournalEntry): Promise<void>;
  /** The reader opened it. Opening is not reading. */
  recordOpen(documentId: string, at: string): Promise<void>;
  /** The reader marked it read — an explicit gesture, never a duration. */
  recordRead(documentId: string, at: string): Promise<void>;

  /** Offers since a date, newest first. */
  offers(since: string): Promise<JournalEntry[]>;
  /**
   * Drop offers older than `before`. Append-only bounds *editing*, not
   * lifetime — see `JournalEntry` for why the horizon is 12 months.
   */
  pruneOffers(before: string): Promise<number>;

  /** Merge another base's signals into ours (§6.4). Additive, per the rules. */
  mergeDocumentSignals(documentId: string, incoming: ReadingSignals): Promise<void>;
}

/**
 * What the **editorial pass** is handed — and it is handed this, never the
 * store (§5.6, Céline's ruling of 2026-08-04).
 *
 * The journal of offers and the reading signals live in the same store under
 * the same document id, so the join *"offered four hundred times, never
 * opened, on these subjects"* is trivially available. That join is the
 * comfort-filter trap: a layer that learns from what you open will learn you
 * rarely open what contradicts you, and quietly stop offering it — with every
 * axis still reporting green.
 *
 * A rule in a document is a discipline that falls in one commit. This is a
 * capability: the editor cannot reach reading signals because **it was never
 * given anything that returns them.** Impossible rather than forbidden.
 *
 * ⚠️ The mirror *must* do that join — it is the whole of §5.6.1 — so the
 * barrier is "the mirror may, the editor may not", and it is hard only on this
 * side. The mirror side rests on the mirror having no outbound edge into
 * composition (§5.6): verifiable, not structural.
 */
export interface EditorView {
  /** Has this ever been offered? The redundancy question of §5.6. */
  everProposed(documentId: string): Promise<boolean>;
  /** When was it last offered — *"does this repeat Tuesday's?"* */
  lastProposedAt(documentId: string): Promise<string | null>;
  /** When did this subject last appear — *"absent two months"* is a reason. */
  subjectLastSeen(topicId: string): Promise<string | null>;
}

/**
 * Project a store down to what the editor may see.
 *
 * Deliberately a projection over the **offers journal only**. Nothing here
 * touches documents, judgments or signals, and adding a method that did would
 * be adding it to the wrong object.
 */
export function editorViewOf(store: SpotterStore): EditorView {
  const EPOCH = '0000-01-01T00:00:00.000Z';
  return {
    async everProposed(documentId) {
      const all = await store.offers(EPOCH);
      return all.some(e => e.documentId === documentId);
    },
    async lastProposedAt(documentId) {
      const all = await store.offers(EPOCH);
      const mine = all.filter(e => e.documentId === documentId).map(e => e.at);
      return mine.length ? mine.reduce((a, b) => (a >= b ? a : b)) : null;
    },
    async subjectLastSeen(topicId) {
      const all = await store.offers(EPOCH);
      const mine = all.filter(e => e.topicId === topicId).map(e => e.at);
      return mine.length ? mine.reduce((a, b) => (a >= b ? a : b)) : null;
    }
  };
}

/**
 * Reference implementation, in memory. It is what the tests run against and
 * what makes the interface real rather than aspirational; the browser host
 * binds IndexedDB behind the same shape, and a Sovereign host would bind
 * `sovereign-db`.
 */
export function createMemoryStore(): SpotterStore {
  const topics = new Map<string, Topic>();
  const documents = new Map<string, StoredDocument>();
  const judgments = new Map<string, Judgment>();
  const relations: Relation[] = [];
  let offerLog: JournalEntry[] = [];

  const mutate = (id: string, f: (s: ReadingSignals) => ReadingSignals) => {
    const doc = documents.get(id);
    if (doc) documents.set(id, { ...doc, signals: f(doc.signals) });
  };

  return {
    async putTopic(topic) {
      topics.set(topic.id, { ...topic });
    },
    async listTopics() {
      return [...topics.values()].filter(t => t.deletedAt === null);
    },

    async putDocument(doc) {
      const existing = documents.get(doc.id);
      documents.set(doc.id, { ...doc, signals: existing ? existing.signals : emptySignals() });
    },
    async getDocument(id) {
      const doc = documents.get(id);
      return doc && doc.deletedAt === null ? { ...doc, signals: { ...doc.signals } } : null;
    },
    async removeDocument(id, at) {
      const doc = documents.get(id);
      if (doc) documents.set(id, { ...doc, deletedAt: at });
    },

    async putJudgment(judgment) {
      judgments.set(judgment.documentId, { ...judgment });
    },
    async getJudgment(documentId) {
      const j = judgments.get(documentId);
      return j ? { ...j } : null;
    },

    async putRelation(relation) {
      relations.push({ ...relation });
    },
    async relationsFrom(documentId) {
      return relations.filter(r => r.fromId === documentId).map(r => ({ ...r }));
    },

    async recordOffer(entry) {
      offerLog.push({ ...entry });
      mutate(entry.documentId, s => ({
        ...s,
        proposedAt: s.proposedAt === null || entry.at < s.proposedAt ? entry.at : s.proposedAt
      }));
    },
    async recordOpen(documentId, at) {
      mutate(documentId, s => ({
        ...s,
        openedAt: s.openedAt === null || at < s.openedAt ? at : s.openedAt,
        openCount: s.openCount + 1
      }));
    },
    async recordRead(documentId, at) {
      mutate(documentId, s => ({
        ...s,
        readAt: s.readAt === null || at < s.readAt ? at : s.readAt,
        lastReadAt: s.lastReadAt === null || at > s.lastReadAt ? at : s.lastReadAt
      }));
    },

    async offers(since) {
      return offerLog
        .filter(e => e.at >= since)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .map(e => ({ ...e }));
    },
    async pruneOffers(before) {
      const kept = offerLog.filter(e => e.at >= before);
      const dropped = offerLog.length - kept.length;
      offerLog = kept;
      return dropped;
    },

    async mergeDocumentSignals(documentId, incoming) {
      mutate(documentId, s => mergeSignals(s, incoming));
    }
  };
}

/** Surfaces are a closed set; anything else is a bug, not a new host. */
export const SURFACES: readonly Surface[] = ['chrome', 'firefox', 'sovereign'];

/**
 * A stable id for a document, derived from its cleaned URL. Two tracking
 * variants of one link must land on the same node, or the redundancy check in
 * §5.6 would offer the same article twice and call it new.
 *
 * It also carries §6.4's merge: deduplication across a user's installs keys on
 * exactly this, so the identity written for one reason serves the other
 * without change.
 *
 * Not a cryptographic hash — this identifies, it does not authenticate.
 */
export function documentIdFor(cleanedUrl: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < cleanedUrl.length; i++) {
    const c = cleanedUrl.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `doc_${h1.toString(36)}${h2.toString(36)}`;
}
