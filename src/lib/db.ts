// Local-first persistence layer built on IndexedDB.
// Every store here lives entirely in the user's browser — nothing in this
// file ever makes a network request. This is the foundation for Local Only
// Mode, dataset privacy levels, and offline-capable session/report storage.

const DB_NAME = 'vkanalyze';
const DB_VERSION = 3; // v3: added WORKFLOWS store

export const STORES = {
  DATASETS: 'datasets', // full parsed dataset payloads (columns + rows)
  SESSIONS: 'sessions', // saved analysis sessions (local equivalent of analysis_sessions)
  REPORTS: 'reports', // generated report/export metadata
  CACHE: 'cache', // cached analytics / AI responses, dashboard calcs
  DASHBOARDS: 'dashboards', // dashboard configurations
  PREFERENCES: 'preferences', // user preferences (single-row store, key = 'app')
  DATASET_PRIVACY: 'dataset_privacy', // per-dataset privacy level + usage timestamps
  CHAT: 'chat', // local-only chat history, keyed by datasetName
  ACTIVITY: 'activity', // local-only activity log
  VERSIONS: 'versions', // local-only dataset version snapshots, keyed by datasetName
  SQL_QUERIES: 'sql_queries', // local-only SQL history/saved queries, keyed by datasetName
  NOTIFICATIONS: 'notifications', // local-only notifications (account-level, single key)
  WORKFLOWS: 'workflows', // cleaning workflow templates
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet<T>(store: StoreName, key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllKeys(store: StoreName): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Rough estimate of how much local storage VKAnalyze is using, for the Privacy Dashboard. */
export async function estimateLocalUsage(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usageBytes: usage ?? 0, quotaBytes: quota ?? 0 };
  } catch {
    return null;
  }
}
