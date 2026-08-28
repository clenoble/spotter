import type { SpotterStore } from '$core/store/store';
import type { JournalEntry, ReadingSignals, Relation, StoredDocument, Topic } from '$core/store/model';
import type { Judgment } from '$core/store/judgment';
import { emptySignals, mergeSignals } from '$core/store/model';

/**
 * The browser host's `SpotterStore` — IndexedDB behind the same contract the
 * memory store satisfies (§6: *IndexedDB now, SurrealDB later, behind one
 * interface*). The contract tests run against **both** implementations from
 * one file, which is what makes "same interface" a checked property instead
 * of a sentence.
 *
 * This is a host module and reaches for `indexedDB` deliberately — storage is
 * a capability, and this file is where the browser host takes it, once,
 * visibly (§6.3). The capability guard walks `src/core/` and would flag this
 * file if it moved there.
 *
 * Signals are only writable through the `record*` methods, mirroring the
 * memory store: `putDocument` preserves whatever signals the row already has.
 * The read-modify-write per call is not transactional across calls, which is
 * fine for a single service worker writing one digest at a time — and wrong
 * the day two writers exist, so it is said here rather than discovered.
 */
const DB_NAME = 'spotter-store';
const DB_VERSION = 1;

type StoredDocumentRow = StoredDocument;
type OfferRow = JournalEntry & { seq?: number };

export function createIdbStore(dbName = DB_NAME): SpotterStore {
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('topics')) db.createObjectStore('topics', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('judgments')) db.createObjectStore('judgments', { keyPath: 'documentId' });
        if (!db.objectStoreNames.contains('relations')) {
          db.createObjectStore('relations', { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('offers')) {
          const offers = db.createObjectStore('offers', { keyPath: 'seq', autoIncrement: true });
          offers.createIndex('at', 'at');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  async function withStore<T>(
    name: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
  ): Promise<T> {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const result = fn(tx.objectStore(name));
        if (result instanceof IDBRequest) {
          result.onsuccess = () => resolve(result.result as T);
          result.onerror = () => reject(result.error);
        } else {
          result.then(resolve, reject);
        }
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  const getDoc = (id: string) => withStore<StoredDocumentRow | undefined>('documents', 'readonly', s => s.get(id));

  const mutateSignals = async (id: string, fn: (s: ReadingSignals) => ReadingSignals): Promise<void> => {
    const doc = await getDoc(id);
    if (!doc) return;
    await withStore('documents', 'readwrite', s => s.put({ ...doc, signals: fn(doc.signals) }));
  };

  return {
    async putTopic(topic: Topic) {
      await withStore('topics', 'readwrite', s => s.put({ ...topic }));
    },
    async listTopics() {
      const all = await withStore<Topic[]>('topics', 'readonly', s => s.getAll());
      return all.filter(t => t.deletedAt === null);
    },

    async putDocument(doc) {
      const existing = await getDoc(doc.id);
      await withStore('documents', 'readwrite', s =>
        s.put({ ...doc, signals: existing ? existing.signals : emptySignals() })
      );
    },
    async getDocument(id) {
      const doc = await getDoc(id);
      return doc && doc.deletedAt === null ? { ...doc, signals: { ...doc.signals } } : null;
    },
    async removeDocument(id, at) {
      const doc = await getDoc(id);
      if (doc) await withStore('documents', 'readwrite', s => s.put({ ...doc, deletedAt: at }));
    },

    async putJudgment(judgment: Judgment) {
      await withStore('judgments', 'readwrite', s => s.put({ ...judgment }));
    },
    async getJudgment(documentId) {
      const j = await withStore<Judgment | undefined>('judgments', 'readonly', s => s.get(documentId));
      return j ? { ...j } : null;
    },

    async putRelation(relation) {
      await withStore('relations', 'readwrite', s => s.add({ ...relation }));
    },
    async relationsFrom(documentId) {
      const all = await withStore<Relation[]>('relations', 'readonly', s => s.getAll());
      return all.filter(r => r.fromId === documentId).map(r => ({ ...r }));
    },

    async recordOffer(entry) {
      await withStore('offers', 'readwrite', s => s.add({ ...entry }));
      await mutateSignals(entry.documentId, s => ({
        ...s,
        proposedAt: s.proposedAt === null || entry.at < s.proposedAt ? entry.at : s.proposedAt
      }));
    },
    async recordOpen(documentId, at) {
      await mutateSignals(documentId, s => ({
        ...s,
        openedAt: s.openedAt === null || at < s.openedAt ? at : s.openedAt,
        openCount: s.openCount + 1
      }));
    },
    async recordRead(documentId, at) {
      await mutateSignals(documentId, s => ({
        ...s,
        readAt: s.readAt === null || at < s.readAt ? at : s.readAt,
        lastReadAt: s.lastReadAt === null || at > s.lastReadAt ? at : s.lastReadAt
      }));
    },

    async offers(since) {
      const all = await withStore<OfferRow[]>('offers', 'readonly', s => s.getAll());
      return all
        .filter(e => e.at >= since)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .map(({ seq, ...e }) => ({ ...e }));
    },
    async pruneOffers(before) {
      const all = await withStore<OfferRow[]>('offers', 'readonly', s => s.getAll());
      const stale = all.filter(e => e.at < before);
      for (const e of stale) {
        if (e.seq !== undefined) await withStore('offers', 'readwrite', s => s.delete(e.seq as number));
      }
      return stale.length;
    },

    async mergeDocumentSignals(documentId, incoming) {
      await mutateSignals(documentId, s => mergeSignals(s, incoming));
    }
  };
}
