import type {
  PreferenceDoc,
  ConsumptionLogEntry,
  ModelChangelogEntry,
  EvalLabelEntry
} from '$shared/types';
import { EMPTY_PREFERENCES } from '$lib/preference/schema';

const DB_NAME = 'spotter';
const DB_VERSION = 2; // v2: evalCorpus store (in-feed labeling)

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('preferences')) db.createObjectStore('preferences');
      if (!db.objectStoreNames.contains('consumption'))
        db.createObjectStore('consumption', { keyPath: 'postId' });
      if (!db.objectStoreNames.contains('changelog'))
        db.createObjectStore('changelog', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('evalCorpus'))
        db.createObjectStore('evalCorpus', { keyPath: 'postId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPreferences(): Promise<PreferenceDoc> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('preferences', 'readonly');
    const req = tx.objectStore('preferences').get('current');
    req.onsuccess = () => resolve((req.result as PreferenceDoc | undefined) ?? EMPTY_PREFERENCES);
    req.onerror = () => reject(req.error);
  });
}

export async function putPreferences(doc: PreferenceDoc): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('preferences', 'readwrite');
    tx.objectStore('preferences').put(doc, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function recordConsumption(entry: ConsumptionLogEntry): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('consumption', 'readwrite');
    tx.objectStore('consumption').put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function recentConsumption(limit = 200): Promise<ConsumptionLogEntry[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('consumption', 'readonly');
    const req = tx.objectStore('consumption').getAll();
    req.onsuccess = () => {
      const all = req.result as ConsumptionLogEntry[];
      resolve(all.slice(-limit));
    };
    req.onerror = () => reject(req.error);
  });
}

// --- Eval corpus (in-feed labeling; raw text by explicit user action only) ---

export async function putEvalLabel(entry: EvalLabelEntry): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('evalCorpus', 'readwrite');
    tx.objectStore('evalCorpus').put(entry); // re-rating a post overwrites
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function allEvalLabels(): Promise<EvalLabelEntry[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('evalCorpus', 'readonly');
    const req = tx.objectStore('evalCorpus').getAll();
    req.onsuccess = () => resolve(req.result as EvalLabelEntry[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEvalLabel(postId: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('evalCorpus', 'readwrite');
    tx.objectStore('evalCorpus').delete(postId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addChangelog(entry: ModelChangelogEntry): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('changelog', 'readwrite');
    tx.objectStore('changelog').put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingChangelog(): Promise<ModelChangelogEntry[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('changelog', 'readonly');
    const req = tx.objectStore('changelog').getAll();
    req.onsuccess = () => {
      const all = req.result as ModelChangelogEntry[];
      resolve(all.filter(e => e.status === 'pending'));
    };
    req.onerror = () => reject(req.error);
  });
}
