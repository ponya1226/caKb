import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import {
  findCategoryRuleForShop,
  findRecentCategoryForShop,
  upsertShopCategoryRule as upsertCategoryRule,
} from "../lib/categorySuggestion";
import { createId } from "../lib/id";
import { normalizeExpenseLineItems } from "../lib/lineItems";
import { localBudgetRepository } from "../lib/repositories/localBudgetRepository";
import { loadSettings, resetSettings, saveSettings } from "../lib/settings";
import { checkStorageHealth, requestPersistentStorage as requestBrowserPersistentStorage } from "../lib/storageHealth";
import type { BudgetRepository } from "../lib/repositories/budgetRepository";
import type {
  AppSettings,
  BackupData,
  BackupImportMode,
  Category,
  Expense,
  ExpenseFormValues,
  ReceiptCategorySuggestion,
  ReceiptImage,
  ShopCategoryRule,
  StorageHealth,
} from "../types";

export type BudgetStorageMode = "local" | "cloud";

type UseBudgetDataOptions = {
  repository?: BudgetRepository;
  storageMode?: BudgetStorageMode;
};

type UseBudgetDataResult = {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  storageMode: BudgetStorageMode;
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
  upsertShopCategoryRule: (shopName: string, categoryId: string) => Promise<void>;
  saveShopCategoryRule: (rule: ShopCategoryRule) => Promise<void>;
  removeShopCategoryRule: (rule: ShopCategoryRule) => Promise<void>;
  hasLocalShopCategoryRulesToMigrate: boolean;
};

function normalizeCategoryColor(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#64748b";
}

function formatRepositoryError(unknownError: unknown): string {
  const code =
    typeof unknownError === "object" && unknownError && "code" in unknownError
      ? String(unknownError.code)
      : "";
  if (code.includes("permission-denied")) {
    return "家計簿へのアクセスが解除されました。再読み込みするか、ログアウトしてください。";
  }

  return unknownError instanceof Error ? unknownError.message : "データの読み込みに失敗しました";
}

function createExpenseRecord(values: ExpenseFormValues, source: Expense["source"], receiptImageId?: string): Expense {
  const now = new Date().toISOString();
  const lineItems = normalizeExpenseLineItems(values.lineItems);

  return {
    id: createId("expense"),
    date: values.date,
    shopName: values.shopName.trim(),
    amount: Math.round(values.amount),
    categoryId: values.categoryId || DEFAULT_CATEGORY_ID,
    memo: values.memo.trim(),
    source,
    receiptImageId,
    ...(lineItems ? { lineItems } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function useBudgetData(options: UseBudgetDataOptions = {}): UseBudgetDataResult {
  const repository = options.repository ?? localBudgetRepository;
  const storageMode = options.storageMode ?? "local";
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [localShopCategoryRules] = useState<ShopCategoryRule[]>(() => loadSettings().shopCategoryRules ?? []);
  const [shopCategoryRules, setShopCategoryRules] = useState<ShopCategoryRule[]>([]);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const snapshot = await repository.getSnapshot();
    setCategories(snapshot.categories);
    setExpenses(snapshot.expenses);
    setShopCategoryRules(snapshot.shopCategoryRules);
    setStorageHealth(await checkStorageHealth(snapshot.expenses));
  }, [repository]);

  const refreshAfterMutation = useCallback(async () => {
    if (!repository.subscribe) {
      await refresh();
    }
  }, [refresh, repository]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    setIsLoading(true);
    setError(null);

    const initialize = async () => {
      try {
        await repository.initialize();
        if (storageMode === "local") {
          await requestBrowserPersistentStorage();
        }

        if (repository.subscribe) {
          unsubscribe = repository.subscribe(
            (snapshot) => {
              if (!isActive) {
                return;
              }
              setCategories(snapshot.categories);
              setExpenses(snapshot.expenses);
              setShopCategoryRules(snapshot.shopCategoryRules);
              setError(null);
              setIsLoading(false);
              void checkStorageHealth(snapshot.expenses).then((health) => {
                if (isActive) {
                  setStorageHealth(health);
                }
              });
            },
            (unknownError) => {
              if (isActive) {
                setError(formatRepositoryError(unknownError));
                setIsLoading(false);
              }
            },
          );
          return;
        }

        await refresh();
        if (isActive) {
          setIsLoading(false);
        }
      } catch (unknownError) {
        if (isActive) {
          setError(formatRepositoryError(unknownError));
          setIsLoading(false);
        }
      }
    };

    void initialize();

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [refresh, repository, storageMode]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const effectiveSettings = useMemo<AppSettings>(() => {
    const nextSettings = { ...settings };
    if (shopCategoryRules.length > 0) {
      nextSettings.shopCategoryRules = shopCategoryRules;
    } else {
      delete nextSettings.shopCategoryRules;
    }
    return nextSettings;
  }, [settings, shopCategoryRules]);

  const addManualExpense = useCallback(
    async (values: ExpenseFormValues) => {
      await repository.saveExpense(createExpenseRecord(values, "manual"));
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const addReceiptExpense = useCallback(
    async (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => {
      let receiptImageId: string | undefined;

      if (receipt && settings.saveReceiptImages && storageMode === "local") {
        receiptImageId = createId("receipt");
        await repository.saveReceiptImage({
          id: receiptImageId,
          imageBlob: receipt.imageBlob,
          ocrText: receipt.ocrText,
          createdAt: new Date().toISOString(),
        });
      }

      await repository.saveExpense(createExpenseRecord(values, "receipt", receiptImageId));
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository, settings.saveReceiptImages, storageMode],
  );

  const updateExpense = useCallback(
    async (expense: Expense, values: ExpenseFormValues) => {
      const lineItems = normalizeExpenseLineItems(values.lineItems);
      const expenseWithoutLineItems = { ...expense };
      delete expenseWithoutLineItems.lineItems;
      await repository.saveExpense({
        ...expenseWithoutLineItems,
        date: values.date,
        shopName: values.shopName.trim(),
        amount: Math.round(values.amount),
        categoryId: values.categoryId || DEFAULT_CATEGORY_ID,
        memo: values.memo.trim(),
        ...(lineItems ? { lineItems } : {}),
        updatedAt: new Date().toISOString(),
      }, { expectedUpdatedAt: expense.updatedAt });
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const removeExpense = useCallback(
    async (expense: Expense) => {
      await repository.deleteExpense(expense.id, { expectedUpdatedAt: expense.updatedAt });
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const updateSettings = useCallback((nextSettings: AppSettings) => {
    saveSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  const importBackup = useCallback(
    async (backup: BackupData, mode: BackupImportMode) => {
      await repository.importApplicationData(
        backup.expenses,
        backup.categories,
        backup.settings.shopCategoryRules ?? [],
        mode,
      );
      saveSettings(backup.settings);
      setSettings(backup.settings);
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
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
      await repository.saveCategory({
        id: createId("category"),
        name,
        color: normalizeCategoryColor(values.color),
        sortOrder: maxSortOrder + 10,
      });
      await refreshAfterMutation();
    },
    [categories, refreshAfterMutation, repository],
  );

  const updateCategory = useCallback(
    async (category: Category, values: Pick<Category, "name" | "color">) => {
      const name = values.name.trim();
      if (!name) {
        throw new Error("カテゴリ名を入力してください");
      }

      await repository.saveCategory({
        ...category,
        name,
        color: normalizeCategoryColor(values.color),
      });
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const removeCategory = useCallback(
    async (category: Category) => {
      if (category.id === DEFAULT_CATEGORY_ID) {
        throw new Error("その他カテゴリは削除できません");
      }

      if (expenses.some((expense) => expense.categoryId === category.id)) {
        throw new Error("支出で使われているカテゴリは削除できません");
      }

      if (shopCategoryRules.some((rule) => rule.categoryId === category.id)) {
        throw new Error("店舗別カテゴリルールで使用中のカテゴリです。先に関連ルールを削除してください。");
      }

      await repository.deleteCategory(category.id);
      await refreshAfterMutation();
    },
    [expenses, refreshAfterMutation, repository, shopCategoryRules],
  );

  const suggestCategoryForShop = useCallback(
    (shopName: string) =>
      findCategoryRuleForShop(shopCategoryRules, shopName) ?? findRecentCategoryForShop(expenses, shopName),
    [expenses, shopCategoryRules],
  );

  const upsertShopCategoryRule = useCallback(
    async (shopName: string, categoryId: string) => {
      const nextRules = upsertCategoryRule(shopCategoryRules, shopName, categoryId);
      const changedRule = nextRules.find((rule) => {
        const currentRule = shopCategoryRules.find((current) => current.id === rule.id);
        return !currentRule || currentRule.updatedAt !== rule.updatedAt;
      });
      if (!changedRule) {
        return;
      }
      await repository.saveShopCategoryRule(changedRule);
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository, shopCategoryRules],
  );

  const saveShopCategoryRule = useCallback(
    async (rule: ShopCategoryRule) => {
      await repository.saveShopCategoryRule(rule);
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const removeShopCategoryRule = useCallback(
    async (rule: ShopCategoryRule) => {
      await repository.deleteShopCategoryRule(rule.id);
      await refreshAfterMutation();
    },
    [refreshAfterMutation, repository],
  );

  const resetData = useCallback(async () => {
    await repository.clearApplicationData();
    resetSettings();
    const defaultSettings = loadSettings();
    setSettings(defaultSettings);
    await refreshAfterMutation();
  }, [refreshAfterMutation, repository]);

  return {
    categories,
    expenses,
    settings: effectiveSettings,
    storageMode,
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
    saveShopCategoryRule,
    removeShopCategoryRule,
    hasLocalShopCategoryRulesToMigrate:
      storageMode === "cloud" && localShopCategoryRules.length > 0 && shopCategoryRules.length === 0,
  };
}
