const DB_NAME = "reinfra-cache";
const DB_VERSION = 1;
const GRAPH_STORE = "rail-graphs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GRAPH_STORE)) {
        db.createObjectStore(GRAPH_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  if (typeof indexedDB === "undefined") return undefined;

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GRAPH_STORE, "readonly");
    const request = transaction.objectStore(GRAPH_STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(GRAPH_STORE, "readwrite");
    const request = transaction.objectStore(GRAPH_STORE).put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
