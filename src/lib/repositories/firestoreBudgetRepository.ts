import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import type { BackupImportMode, Category, CloudCategory, CloudExpense, CloudShopCategoryRule, Expense, ReceiptImage, ShopCategoryRule } from "../../types";
import { toCloudCategory, toCloudExpense, toCloudShopCategoryRule } from "../cloudHousehold";
import { removeUndefinedFields } from "../firestoreSanitizer";
import { householdCategoriesPath, householdExpensesPath, householdShopCategoryRulesPath } from "../firestorePaths";
import { BudgetConflictError, type BudgetRepository, type BudgetSnapshot, type ExpenseMutationOptions } from "./budgetRepository";

const FIRESTORE_BATCH_LIMIT = 450;

export function fromCloudExpense(expense: CloudExpense): Expense {
  const { householdId: _householdId, ...localExpense } = expense;
  return localExpense;
}

export function fromCloudCategory(category: CloudCategory): Category {
  const { householdId: _householdId, createdAt: _createdAt, updatedAt: _updatedAt, ...localCategory } = category;
  return localCategory;
}

export function fromCloudShopCategoryRule(rule: CloudShopCategoryRule): ShopCategoryRule {
  const { householdId: _householdId, ...shopCategoryRule } = rule;
  return shopCategoryRule;
}

export function assertExpectedExpenseVersion(currentUpdatedAt: unknown, expectedUpdatedAt?: string): void {
  if (expectedUpdatedAt && currentUpdatedAt !== expectedUpdatedAt) {
    throw new BudgetConflictError();
  }
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
  const shopCategoryRulesPath = householdShopCategoryRulesPath(householdId);

  async function getSnapshot(): Promise<BudgetSnapshot> {
    const [expenseSnapshots, categorySnapshots, shopCategoryRuleSnapshots] = await Promise.all([
      getDocs(collection(firestore, expensesPath)),
      getDocs(collection(firestore, categoriesPath)),
      getDocs(collection(firestore, shopCategoryRulesPath)),
    ]);

    return {
      expenses: expenseSnapshots.docs
        .map((snapshot) => fromCloudExpense(snapshot.data() as CloudExpense))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
      categories: categorySnapshots.docs
        .map((snapshot) => fromCloudCategory(snapshot.data() as CloudCategory))
        .sort((a, b) => a.sortOrder - b.sortOrder),
      shopCategoryRules: shopCategoryRuleSnapshots.docs
        .map((snapshot) => fromCloudShopCategoryRule(snapshot.data() as CloudShopCategoryRule))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  async function saveExpense(expense: Expense, options?: ExpenseMutationOptions): Promise<void> {
    const cloudExpense = removeUndefinedFields(toCloudExpense(expense, householdId, uid));
    const expenseRef = doc(firestore, expensesPath, expense.id);
    if (!options?.expectedUpdatedAt) {
      await setDoc(expenseRef, cloudExpense);
      return;
    }

    await runTransaction(firestore, async (transaction) => {
      const currentSnapshot = await transaction.get(expenseRef);
      assertExpectedExpenseVersion(currentSnapshot.exists() ? currentSnapshot.data().updatedAt : undefined, options.expectedUpdatedAt);
      transaction.set(expenseRef, cloudExpense);
    });
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
      let shopCategoryRules: ShopCategoryRule[] | null = null;

      const emitSnapshot = () => {
        if (expenses && categories && shopCategoryRules) {
          listener({ expenses, categories, shopCategoryRules });
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
      const unsubscribeShopCategoryRules = onSnapshot(
        collection(firestore, shopCategoryRulesPath),
        (snapshot) => {
          shopCategoryRules = snapshot.docs
            .map((document) => fromCloudShopCategoryRule(document.data() as CloudShopCategoryRule))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          emitSnapshot();
        },
        onError,
      );

      return () => {
        unsubscribeExpenses();
        unsubscribeCategories();
        unsubscribeShopCategoryRules();
      };
    },
    saveExpense,
    deleteExpense: async (id, options) => {
      const expenseRef = doc(firestore, expensesPath, id);
      if (!options?.expectedUpdatedAt) {
        await deleteDoc(expenseRef);
        return;
      }
      await runTransaction(firestore, async (transaction) => {
        const currentSnapshot = await transaction.get(expenseRef);
        assertExpectedExpenseVersion(currentSnapshot.exists() ? currentSnapshot.data().updatedAt : undefined, options.expectedUpdatedAt);
        transaction.delete(expenseRef);
      });
    },
    saveReceiptImage: async (_receiptImage: ReceiptImage) => undefined,
    saveCategory,
    deleteCategory: async (id) => {
      await deleteDoc(doc(firestore, categoriesPath, id));
    },
    saveShopCategoryRule: async (rule) => {
      await setDoc(
        doc(firestore, shopCategoryRulesPath, rule.id),
        removeUndefinedFields(toCloudShopCategoryRule(rule, householdId)),
      );
    },
    deleteShopCategoryRule: async (id) => {
      await deleteDoc(doc(firestore, shopCategoryRulesPath, id));
    },
    importApplicationData: async (
      expenses: Expense[],
      categories: Category[],
      shopCategoryRules: ShopCategoryRule[],
      mode: BackupImportMode,
    ) => {
      if (mode === "replace") {
        await Promise.all([
          deleteCollectionDocuments(firestore, expensesPath),
          deleteCollectionDocuments(firestore, categoriesPath),
          deleteCollectionDocuments(firestore, shopCategoryRulesPath),
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
        commitBatchItems(
          shopCategoryRules,
          (batch, rule) => {
            batch.set(
              doc(firestore, shopCategoryRulesPath, rule.id),
              removeUndefinedFields(toCloudShopCategoryRule(rule, householdId)),
            );
          },
          firestore,
        ),
      ]);
    },
    clearApplicationData: async () => {
      await Promise.all([
        deleteCollectionDocuments(firestore, expensesPath),
        deleteCollectionDocuments(firestore, categoriesPath),
        deleteCollectionDocuments(firestore, shopCategoryRulesPath),
      ]);
    },
  };
}
