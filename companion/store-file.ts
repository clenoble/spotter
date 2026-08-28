import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SpotterStore } from '../src/core/store/store';
import type { JournalEntry, ReadingSignals, Relation, StoredDocument, Topic } from '../src/core/store/model';
import type { Judgment } from '../src/core/store/judgment';
import { emptySignals, mergeSignals } from '../src/core/store/model';

/**
 * The companion's `SpotterStore` — a JSON file behind the same contract the
 * memory and IndexedDB stores satisfy, verified by the same contract suite
 * (`test/store-contract.ts`). That is the Sovereign seam: the binding that
 * replaces this one later (`sovereign-db`) runs the same tests, and nothing
 * upstream knows the difference.
 *
 * A JSON file, deliberately: the digest writes five documents a day, and a
 * database for that volume would be architecture cosplay. Writes are atomic
 * (tmp + rename) so a crash mid-write leaves the previous state, not a torn
 * one. Single-process by assumption — the companion is one process, and the
 * day that stops being true this store is the wrong one, which is stated here
 * rather than discovered.
 *
 * ⚠️ **Plaintext on disk, and declared as such.** The companion host's
 * manifest says `encryptedAtRest: false` and holds the `ordinary` class only
 * — nothing tender exists in v0.1 (no stance model, no cursor), and
 * `mayPersist(tender)` is false here exactly as it is in the browser host.
 */
interface FileState {
  topics: Record<string, Topic>;
  documents: Record<string, StoredDocument>;
  judgments: Record<string, Judgment>;
  relations: Relation[];
  offers: JournalEntry[];
}

const EMPTY_STATE: FileState = { topics: {}, documents: {}, judgments: {}, relations: [], offers: [] };

let storeSeq = 0;

export function createFileStore(path: string): SpotterStore {
  mkdirSync(dirname(path), { recursive: true });
  let state: FileState = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as FileState)
    : structuredClone(EMPTY_STATE);

  // Unique per instance and per write — Date.now() collides across instances
  // sharing a directory in the same millisecond.
  const instance = `${process.pid}-${storeSeq++}`;
  let writeSeq = 0;

  const persist = () => {
    const tmp = join(dirname(path), `.${instance}-${writeSeq++}.tmp`);
    writeFileSync(tmp, JSON.stringify(state), 'utf8');
    // Windows: rename fails sporadically with EPERM while an antivirus or
    // indexer briefly holds the file. Contract tests flaked exactly twice on
    // this store and never in isolation, which is that signature. A short
    // retry is the standard cure; if it still fails, fail loudly — a store
    // that shrugs off a failed persist is lying about being durable.
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(tmp, path);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if ((code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') && attempt < 5) {
          const until = Date.now() + 2 ** attempt * 10;
          while (Date.now() < until) {
            /* sync store, sync backoff — single-threaded by design */
          }
          continue;
        }
        throw err;
      }
    }
  };

  const mutateSignals = (id: string, fn: (s: ReadingSignals) => ReadingSignals) => {
    const doc = state.documents[id];
    if (!doc) return;
    state.documents[id] = { ...doc, signals: fn(doc.signals) };
    persist();
  };

  return {
    async putTopic(topic) {
      state.topics[topic.id] = { ...topic };
      persist();
    },
    async listTopics() {
      return Object.values(state.topics).filter(t => t.deletedAt === null);
    },

    async putDocument(doc) {
      const existing = state.documents[doc.id];
      state.documents[doc.id] = { ...doc, signals: existing ? existing.signals : emptySignals() };
      persist();
    },
    async getDocument(id) {
      const doc = state.documents[id];
      return doc && doc.deletedAt === null ? { ...doc, signals: { ...doc.signals } } : null;
    },
    async removeDocument(id, at) {
      const doc = state.documents[id];
      if (doc) {
        state.documents[id] = { ...doc, deletedAt: at };
        persist();
      }
    },

    async putJudgment(judgment) {
      state.judgments[judgment.documentId] = { ...judgment };
      persist();
    },
    async getJudgment(documentId) {
      const j = state.judgments[documentId];
      return j ? { ...j } : null;
    },

    async putRelation(relation) {
      state.relations.push({ ...relation });
      persist();
    },
    async relationsFrom(documentId) {
      return state.relations.filter(r => r.fromId === documentId).map(r => ({ ...r }));
    },

    async recordOffer(entry) {
      state.offers.push({ ...entry });
      const doc = state.documents[entry.documentId];
      if (doc) {
        state.documents[entry.documentId] = {
          ...doc,
          signals: {
            ...doc.signals,
            proposedAt:
              doc.signals.proposedAt === null || entry.at < doc.signals.proposedAt
                ? entry.at
                : doc.signals.proposedAt
          }
        };
      }
      persist();
    },
    async recordOpen(documentId, at) {
      mutateSignals(documentId, s => ({
        ...s,
        openedAt: s.openedAt === null || at < s.openedAt ? at : s.openedAt,
        openCount: s.openCount + 1
      }));
    },
    async recordRead(documentId, at) {
      mutateSignals(documentId, s => ({
        ...s,
        readAt: s.readAt === null || at < s.readAt ? at : s.readAt,
        lastReadAt: s.lastReadAt === null || at > s.lastReadAt ? at : s.lastReadAt
      }));
    },

    async offers(since) {
      return state.offers
        .filter(e => e.at >= since)
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
        .map(e => ({ ...e }));
    },
    async pruneOffers(before) {
      const kept = state.offers.filter(e => e.at >= before);
      const dropped = state.offers.length - kept.length;
      state.offers = kept;
      persist();
      return dropped;
    },

    async mergeDocumentSignals(documentId, incoming) {
      mutateSignals(documentId, s => mergeSignals(s, incoming));
    }
  };
}
