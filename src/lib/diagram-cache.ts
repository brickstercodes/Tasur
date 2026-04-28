/**
 * Browser-side cache for rendered PDF page images, stored in IndexedDB.
 *
 * When a diagram node is first opened, pdfjs-dist renders the PDF page to a
 * canvas and we store the result as a data-URL here. Subsequent opens are
 * instant — no PDF re-render, no server round-trip.
 *
 * Keys are `${sessionId}:${pageNumber}` so each session's pages are isolated.
 * The store lives in a separate DB from the document cache to avoid a version
 * conflict when both features are in use simultaneously.
 */

const DB_NAME = 'tasur-diagram-cache';
const STORE = 'pages';
const DB_VERSION = 1;

interface CachedPage {
  dataUrl: string;
  width: number;
  height: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeKey(sessionId: string, pageNumber: number): string {
  return `${sessionId}:${pageNumber}`;
}

export async function saveDiagramPage(
  sessionId: string,
  pageNumber: number,
  dataUrl: string,
  width: number,
  height: number,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const entry: CachedPage = { dataUrl, width, height };
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry, makeKey(sessionId, pageNumber));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDiagramPage(
  sessionId: string,
  pageNumber: number,
): Promise<CachedPage | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(makeKey(sessionId, pageNumber));
    req.onsuccess = () => resolve(req.result as CachedPage | undefined);
    req.onerror = () => reject(req.error);
  });
}
