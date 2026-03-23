/**
 * Browser-side document cache using IndexedDB.
 *
 * When a user uploads a file we already have the bytes in the browser — there's
 * no reason to round-trip through server storage just to show it back. This
 * module stores the original File in IndexedDB keyed by sessionId so FocusZone
 * can create a blob: URL and render the PDF natively, zero server calls needed.
 */

const DB_NAME = 'tasur-docs';
const STORE = 'files';
const DB_VERSION = 1;

interface CachedDoc {
  name: string;
  type: string;
  data: Blob;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDocToCache(sessionId: string, file: File): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const entry: CachedDoc = { name: file.name, type: file.type || 'application/octet-stream', data: file };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDocFromCache(sessionId: string): Promise<CachedDoc | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(sessionId);
    req.onsuccess = () => resolve(req.result as CachedDoc | undefined);
    req.onerror = () => reject(req.error);
  });
}
