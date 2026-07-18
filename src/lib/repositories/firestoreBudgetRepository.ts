import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { BackupImportMode, Category, CloudCategory, CloudExpense, Expense, ReceiptImage } from "../../types";
import { toCloudCategory, toCloudExpense } from "../cloudHousehold";
import { removeUndefinedFields } from "../firestoreSanitizer";
import { householdCategoriesPath, householdExpensesPath } from "../firestorePaths";
import type { BudgetRepository, BudgetSnapshot } from "./budgetRepository";

const FIRESTORE_BATCH_LIMIT = 450;

export function fromCloudExpense(expense: CloudExpense): Expense {
  const { householdId: _householdId, ...localExpense } = expense;
  return localExpense;
}

export function fromCloudCategory(category: CloudCategory): Category {
  const { householdId: _householdId, createdAt: _createdAt, updatedAt: _updatedAt, ...localCategory } = category;
  return localCategory;
}

async function commitBatchItems<T>(
  items: T[],
  writeItem: (batch: WriteBatch, item: T) => void,
  firestore: Firestore,
): Promise<void> {
  for (let startIndex = 0; startIndex < items.length; startIndex += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    items.slice(startIndex, startIndex + FIRESTORE_BATCH_LIMIT).forEach((item) => writeItem(batch, item));
    await batch.commit();
  }
}

async function deleteCollectionDocuments(firestore: Firestore, collectionPath: string): Promise<void> {
  const snapshots = await getDocs(collection(firestore, collectionPath));
  await commitBatchItems(
    snapshots.docs,
    (batch, snapshot) => {
      batch.delete(snapshot.ref);
    },
    firestore,
  );
}

export function createFirestoreBudgetRepository(
  firestore: Firestore,
  householdId: string,
  uid: string,
): BudgetRepository {
  const expensesPath = householdExpensesPath(householdId);
  const categoriesPath = householdCategoriesPath(householdId);

  async function getSnapshot(): Promise<BudgetSnapshot> {
    const [expenseSnapshots, categorySnapshots] = await Promise.all([
      getDocs(collection(firestore, expensesPath)),
      getDocs(collection(firestore, categoriesPath)),
    ]);

    return {
      expenses: expenseSnapshots.docs
        .map((snapshot) => fromCloudExpense(snapshot.data() as CloudExpense))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      categories: categorySnapshots.docs
        .map((snapshot) => fromCloudCategory(snapshot.data() as CloudCategory))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }

  async function saveExpense(expense: Expense): Promise<void> {
    const cloudExpense = removeUndefinedFields(toCloudExpense(expense, householdId, uid));
    await setDoc(doc(firestore, expensesPath, expense.id), cloudExpense);
  }

  async function saveCategory(category: Category): Promise<void> {
    const cloudCategory = removeUndefinedFields(toCloudCategory(category, householdId));
    await setDoc(doc(firestore, categoriesPath, category.id), cloudCategory);
  }

  return {
    initialize: async () => undefined,
    getSnapshot,
    subscribe: (listener, onError) => {
      let expenses: Expense[] | null = null;
      let categories: Category[] | null = null;

      const emitSnapshot = () => {
        if (expenses && categories) {
          listener({ expenses, categories });
        }
      };

      const unsubscribeExpenses = onSnapshot(
        collection(firestore, expensesPath),
        (snapshot) => {
          expenses = snapshot.docs
            .map((document) => fromCloudExpense(document.data() as CloudExpense))
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
          emitSnapshot();
        },
        onError,
      );
      const unsubscribeCategories = onSnapshot(
        collection(firestore, categoriesPath),
        (snapshot) => {
          categories = snapshot.docs
            .map((document) => fromCloudCategory(document.data() as CloudCategory))
            .sort((a, b) => a.sortOrder - b.sortOrder);
          emitSnapshot();
        },
        onError,
      );

      return () => {
        unsubscribeExpenses();
        unsubscribeCategories();
      };
    },
    saveExpense,
    deleteExpense: async (id) => {
      await deleteDoc(doc(firestore, expensesPath, id));
    },
    saveReceiptImage: async (_receiptImage: ReceiptImage) => undefined,
    saveCategory,
    deleteCategory: async (id) => {
      await deleteDoc(doc(firestore, categoriesPath, id));
    },
    importApplicationData: async (expenses: Expense[], categories: Category[], mode: BackupImportMode) => {
      if (mode === "replace") {
        await Promise.all([
          deleteCollectionDocuments(firestore, expensesPath),
          deleteCollectionDocuments(firestore, categoriesPath),
        ]);
      }

      await Promise.all([
        commitBatchItems(
          categories,
          (batch, category) => {
            batch.set(doc(firestore, categoriesPath, category.id), removeUndefinedFields(toCloudCategory(category, householdId)));
          },
          firestore,
        ),
        commitBatchItems(
          expenses,
          (batch, expense) => {
            batch.set(doc(firestore, expensesPath, expense.id), removeUndefinedFields(toCloudExpense(expense, householdId, uid)));
          },
          firestore,
        ),
      ]);
    },
    clearApplicationData: async () => {
      await Promise.all([
        deleteCollectionDocuments(firestore, expensesPath),
        deleteCollectionDocuments(firestore, categoriesPath),
      ]);
    },
  };
}
