import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import {
  clearApplicationData,
  deleteCategory as deleteCategoryRecord,
  deleteExpense as deleteExpenseRecord,
  getCategories,
  getExpenses,
  importApplicationData,
  initializeDatabase,
  saveCategory,
  saveExpense,
  saveReceiptImage,
} from "../lib/db";
import {
  findCategoryRuleForShop,
  findRecentCategoryForShop,
  upsertShopCategoryRule as upsertCategoryRule,
} from "../lib/categorySuggestion";
import { createId } from "../lib/id";
import { loadSettings, resetSettings, saveSettings } from "../lib/settings";
import { checkStorageHealth, requestPersistentStorage as requestBrowserPersistentStorage } from "../lib/storageHealth";
import type {
  AppSettings,
  BackupData,
  BackupImportMode,
  Category,
  Expense,
  ExpenseFormValues,
  ReceiptCategorySuggestion,
  ReceiptImage,
  StorageHealth,
} from "../types";

type UseBudgetDataResult = {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  storageHealth: StorageHealth | null;
  isLoading: boolean;
  error: string | null;
  categoryMap: Map<string, Category>;
  addManualExpense: (values: ExpenseFormValues) => Promise<void>;
  addReceiptExpense: (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => Promise<void>;
  updateExpense: (expense: Expense, values: ExpenseFormValues) => Promise<void>;
  removeExpense: (expense: Expense) => Promise<void>;
  updateSettings: (settings: AppSettings) => void;
  importBackup: (backup: BackupData, mode: BackupImportMode) => Promise<void>;
  requestPersistentStorage: () => Promise<boolean>;
  refreshStorageHealth: () => Promise<void>;
  resetData: () => Promise<void>;
  refresh: () => Promise<void>;
  addCategory: (values: Pick<Category, "name" | "color">) => Promise<void>;
  updateCategory: (category: Category, values: Pick<Category, "name" | "color">) => Promise<void>;
  removeCategory: (category: Category) => Promise<void>;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  upsertShopCategoryRule: (shopName: string, categoryId: string) => void;
};

function normalizeCategoryColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#64748b";
}

function createExpenseRecord(values: ExpenseFormValues, source: Expense["source"], receiptImageId?: string): Expense {
  const now = new Date().toISOString();

  return {
    id: createId("expense"),
    date: values.date,
    shopName: values.shopName.trim(),
    amount: Math.round(values.amount),
    categoryId: values.categoryId || DEFAULT_CATEGORY_ID,
    memo: values.memo.trim(),
    source,
    receiptImageId,
    createdAt: now,
    updatedAt: now,
  };
}

export function useBudgetData(): UseBudgetDataResult {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [nextCategories, nextExpenses] = await Promise.all([getCategories(), getExpenses()]);
    setCategories(nextCategories);
    setExpenses(nextExpenses);
    setStorageHealth(await checkStorageHealth(nextExpenses));
  }, []);

  useEffect(() => {
    let isActive = true;

    initializeDatabase()
      .then(async () => {
        await requestBrowserPersistentStorage();
        await refresh();
      })
      .catch((unknownError) => {
        if (isActive) {
          setError(unknownError instanceof Error ? unknownError.message : "データの読み込みに失敗しました");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [refresh]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const addManualExpense = useCallback(
    async (values: ExpenseFormValues) => {
      await saveExpense(createExpenseRecord(values, "manual"));
      await refresh();
    },
    [refresh],
  );

  const addReceiptExpense = useCallback(
    async (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => {
      let receiptImageId: string | undefined;

      if (receipt && settings.saveReceiptImages) {
        receiptImageId = createId("receipt");
        await saveReceiptImage({
          id: receiptImageId,
          imageBlob: receipt.imageBlob,
          ocrText: receipt.ocrText,
          createdAt: new Date().toISOString(),
        });
      }

      await saveExpense(createExpenseRecord(values, "receipt", receiptImageId));
      await refresh();
    },
    [refresh, settings.saveReceiptImages],
  );

  const updateExpense = useCallback(
    async (expense: Expense, values: ExpenseFormValues) => {
      await saveExpense({
        ...expense,
        date: values.date,
        shopName: values.shopName.trim(),
        amount: Math.round(values.amount),
        categoryId: values.categoryId || DEFAULT_CATEGORY_ID,
        memo: values.memo.trim(),
        updatedAt: new Date().toISOString(),
      });
      await refresh();
    },
    [refresh],
  );

  const removeExpense = useCallback(
    async (expense: Expense) => {
      await deleteExpenseRecord(expense.id);
      await refresh();
    },
    [refresh],
  );

  const updateSettings = useCallback((nextSettings: AppSettings) => {
    saveSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  const importBackup = useCallback(
    async (backup: BackupData, mode: BackupImportMode) => {
      await importApplicationData(backup.expenses, backup.categories, mode);
      saveSettings(backup.settings);
      setSettings(backup.settings);
      await refresh();
    },
    [refresh],
  );

  const refreshStorageHealth = useCallback(async () => {
    setStorageHealth(await checkStorageHealth(expenses));
  }, [expenses]);

  const requestPersistentStorage = useCallback(async () => {
    const granted = await requestBrowserPersistentStorage();
    setStorageHealth(await checkStorageHealth(expenses));
    return granted;
  }, [expenses]);

  const addCategory = useCallback(
    async (values: Pick<Category, "name" | "color">) => {
      const name = values.name.trim();
      if (!name) {
        throw new Error("カテゴリ名を入力してください");
      }

      const maxSortOrder = categories.reduce((maxValue, category) => Math.max(maxValue, category.sortOrder), 0);
      await saveCategory({
        id: createId("category"),
        name,
        color: normalizeCategoryColor(values.color),
        sortOrder: maxSortOrder + 10,
      });
      await refresh();
    },
    [categories, refresh],
  );

  const updateCategory = useCallback(
    async (category: Category, values: Pick<Category, "name" | "color">) => {
      const name = values.name.trim();
      if (!name) {
        throw new Error("カテゴリ名を入力してください");
      }

      await saveCategory({
        ...category,
        name,
        color: normalizeCategoryColor(values.color),
      });
      await refresh();
    },
    [refresh],
  );

  const removeCategory = useCallback(
    async (category: Category) => {
      if (category.id === DEFAULT_CATEGORY_ID) {
        throw new Error("その他カテゴリは削除できません");
      }

      if (expenses.some((expense) => expense.categoryId === category.id)) {
        throw new Error("支出で使われているカテゴリは削除できません");
      }

      await deleteCategoryRecord(category.id);
      const nextRules = settings.shopCategoryRules?.filter((rule) => rule.categoryId !== category.id) ?? [];
      if (nextRules.length !== (settings.shopCategoryRules?.length ?? 0)) {
        const nextSettings: AppSettings = { ...settings };
        if (nextRules.length > 0) {
          nextSettings.shopCategoryRules = nextRules;
        } else {
          delete nextSettings.shopCategoryRules;
        }
        updateSettings(nextSettings);
      }
      await refresh();
    },
    [expenses, refresh, settings, updateSettings],
  );

  const suggestCategoryForShop = useCallback(
    (shopName: string) =>
      findCategoryRuleForShop(settings.shopCategoryRules, shopName) ?? findRecentCategoryForShop(expenses, shopName),
    [expenses, settings.shopCategoryRules],
  );

  const upsertShopCategoryRule = useCallback(
    (shopName: string, categoryId: string) => {
      const nextRules = upsertCategoryRule(settings.shopCategoryRules, shopName, categoryId);
      updateSettings({
        ...settings,
        ...(nextRules.length > 0 ? { shopCategoryRules: nextRules } : {}),
      });
    },
    [settings, updateSettings],
  );

  const resetData = useCallback(async () => {
    await clearApplicationData();
    resetSettings();
    const defaultSettings = loadSettings();
    setSettings(defaultSettings);
    await refresh();
  }, [refresh]);

  return {
    categories,
    expenses,
    settings,
    storageHealth,
    isLoading,
    error,
    categoryMap,
    addManualExpense,
    addReceiptExpense,
    updateExpense,
    removeExpense,
    updateSettings,
    importBackup,
    requestPersistentStorage,
    refreshStorageHealth,
    resetData,
    refresh,
    addCategory,
    updateCategory,
    removeCategory,
    suggestCategoryForShop,
    upsertShopCategoryRule,
  };
}
