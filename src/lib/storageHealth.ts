import type { Expense, StorageHealth } from "../types";
import { toMonthKey } from "./date";

const HEALTH_DB_NAME = "local-kakeibo-pwa-health";
const HEALTH_STORE_NAME = "checks";
const HEALTH_RECORD_ID = "latest";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function verifyIndexedDb(): Promise<boolean> {
  if (typeof indexedDB === "undefined") {
    return false;
  }

  let db: IDBDatabase | null = null;

  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(HEALTH_DB_NAME, 1);

      request.onupgradeneeded = () => {
        const nextDb = request.result;
        if (!nextDb.objectStoreNames.contains(HEALTH_STORE_NAME)) {
          nextDb.createObjectStore(HEALTH_STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const transaction = db.transaction(HEALTH_STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(HEALTH_STORE_NAME);
    const checkedAt = new Date().toISOString();
    store.put({ id: HEALTH_RECORD_ID, checkedAt });
    await done;

    const readTransaction = db.transaction(HEALTH_STORE_NAME, "readonly");
    const readDone = transactionDone(readTransaction);
    const record = await requestToPromise<{ id: string; checkedAt: string } | undefined>(
      readTransaction.objectStore(HEALTH_STORE_NAME).get(HEALTH_RECORD_ID),
    );
    await readDone;

    return record?.checkedAt === checkedAt;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function summarizeMonths(expenses: Expense[]): Pick<StorageHealth, "monthCount" | "oldestMonth" | "latestMonth"> {
  const months = Array.from(new Set(expenses.map((expense) => toMonthKey(expense.date)))).sort();

  return {
    monthCount: months.length,
    ...(months[0] ? { oldestMonth: months[0] } : {}),
    ...(months[months.length - 1] ? { latestMonth: months[months.length - 1] } : {}),
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.storage?.persist !== "function") {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function checkStorageHealth(expenses: Expense[]): Promise<StorageHealth> {
  const [indexedDbAvailable, persisted, estimate] = await Promise.all([
    verifyIndexedDb(),
    typeof navigator !== "undefined" && typeof navigator.storage?.persisted === "function"
      ? navigator.storage.persisted().catch(() => false)
      : Promise.resolve(false),
    typeof navigator !== "undefined" && typeof navigator.storage?.estimate === "function"
      ? navigator.storage.estimate().catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  const monthSummary = summarizeMonths(expenses);

  return {
    indexedDbAvailable,
    persistentStorageSupported: typeof navigator !== "undefined" && typeof navigator.storage?.persist === "function",
    persistentStorageGranted: persisted,
    ...(typeof estimate?.usage === "number" ? { usageBytes: estimate.usage } : {}),
    ...(typeof estimate?.quota === "number" ? { quotaBytes: estimate.quota } : {}),
    expenseCount: expenses.length,
    ...monthSummary,
    checkedAt: new Date().toISOString(),
  };
}
