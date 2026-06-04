import type { ValidationIssue } from "@/lib/validator";

export interface MigrationSnapshot {
  id: string;
  timestamp: string;
  label: string;
  direction: "aws-to-azure" | "azure-to-aws";
  sourceCode: string;
  outputCode: string;
  migrationLog: string[];
  validationIssues: ValidationIssue[];
}

const DB_NAME = "flowmigrate_versions";
const STORE_NAME = "migrations";
const DB_VERSION = 1;

// Singleton to avoid multiple opens in StrictMode
let dbPromise: Promise<IDBDatabase> | null = null;

export function openVersionDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function saveSnapshot(snap: MigrationSnapshot): Promise<void> {
  const db = await openVersionDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(snap);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listSnapshots(): Promise<MigrationSnapshot[]> {
  const db = await openVersionDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).index("timestamp").openCursor(null, "prev");
    const results: MigrationSnapshot[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        results.push(cursor.value as MigrationSnapshot);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getSnapshot(id: string): Promise<MigrationSnapshot | undefined> {
  const db = await openVersionDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as MigrationSnapshot | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openVersionDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllSnapshots(): Promise<void> {
  const db = await openVersionDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
