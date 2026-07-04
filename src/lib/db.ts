import { DEFAULT_CATEGORIES } from "../constants/categories";
import type { BackupImportMode, Category, Expense, ReceiptImage } from "../types";

const DB_NAME = "local-kakeibo-pwa";
const DB_VERSION = 1;

type StoreName = "expenses" | "categories" | "receiptImages";

let dbPromise: Promise<IDBDatabase> | null = null;

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

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("expenses")) {
        const store = db.createObjectStore("expenses", { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("categoryId", "categoryId", { unique: false });
        store.createIndex("receiptImageId", "receiptImageId", { unique: false });
      }

      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("receiptImages")) {
        db.createObjectStore("receiptImages", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const done = transactionDone(transaction);
  const values = await requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
  await done;
  return values;
}

async function putRecord<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).put(value);
  await done;
}

async function deleteRecord(storeName: StoreName, id: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).delete(id);
  await done;
}

async function clearStore(storeName: StoreName): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).clear();
  await done;
}

async function countRecords(storeName: StoreName): Promise<number> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const done = transactionDone(transaction);
  const count = await requestToPromise(transaction.objectStore(storeName).count());
  await done;
  return count;
}

export async function initializeDatabase(): Promise<void> {
  await openDatabase();
  await seedCategories();
}

export async function seedCategories(): Promise<void> {
  const count = await countRecords("categories");
  if (count > 0) {
    return;
  }

  const db = await openDatabase();
  const transaction = db.transaction("categories", "readwrite");
  const done = transactionDone(transaction);
  const store = transaction.objectStore("categories");
  DEFAULT_CATEGORIES.forEach((category) => store.put(category));

  await done;
}

export async function getCategories(): Promise<Category[]> {
  const categories = await getAll<Category>("categories");
  return categories.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getExpenses(): Promise<Expense[]> {
  const expenses = await getAll<Expense>("expenses");
  return expenses.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveExpense(expense: Expense): Promise<void> {
  await putRecord("expenses", expense);
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteRecord("expenses", id);
}

export async function saveReceiptImage(receiptImage: ReceiptImage): Promise<void> {
  await putRecord("receiptImages", receiptImage);
}

export async function importApplicationData(
  expenses: Expense[],
  categories: Category[],
  mode: BackupImportMode,
): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(["expenses", "categories", "receiptImages"], "readwrite");
  const done = transactionDone(transaction);
  const expenseStore = transaction.objectStore("expenses");
  const categoryStore = transaction.objectStore("categories");
  const receiptImageStore = transaction.objectStore("receiptImages");
  const nextCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;

  if (mode === "replace") {
    expenseStore.clear();
    categoryStore.clear();
    receiptImageStore.clear();
  }

  nextCategories.forEach((category) => categoryStore.put(category));
  expenses.forEach((expense) => expenseStore.put(expense));

  await done;
}

export async function clearApplicationData(): Promise<void> {
  await clearStore("expenses");
  await clearStore("receiptImages");
  await clearStore("categories");
  await seedCategories();
}
