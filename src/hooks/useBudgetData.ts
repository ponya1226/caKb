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
  CloudConnectionState,
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
  enabled?: boolean;
};

type UseBudgetDataResult = {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  storageMode: BudgetStorageMode;
  cloudConnection: CloudConnectionState | null;
  storageHealth: StorageHealth | null;
  isLoading: boolean;
  error: string | null;
  categoryMap: Map<string, Category>;
  addManualExpense: (values: ExpenseFormValues) => Promise<void>;
  addReceiptExpense: (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => Promise<Expense>;
  updateExpense: (expense: Expense, values: ExpenseFormValues) => Promise<void>;
  removeExpense: (expense: Expense) => Promise<void>;
  updateSettings: (settings: AppSettings) => void;
  importBackup: (backup: BackupData, mode: BackupImportMode) => Promise<void>;
  requestPersistentStorage: () => Promise<boolean>;
  refreshStorageHealth: () => Promise<void>;
  resetData: () => Promise<void>;
  refresh: () => Promise<void>;
  retryCloudConnection: () => void;
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

export function getRepositoryErrorCode(unknownError: unknown): string {
  return typeof unknownError === "object" && unknownError && "code" in unknownError
    ? String(unknownError.code)
    : "";
}

export function isPermissionDeniedRepositoryError(unknownError: unknown): boolean {
  return getRepositoryErrorCode(unknownError).includes("permission-denied");
}

export function isRetryableRepositoryError(unknownError: unknown): boolean {
  const code = getRepositoryErrorCode(unknownError);
  return ["unavailable", "deadline-exceeded", "network-request-failed", "resource-exhausted"]
    .some((retryableCode) => code.includes(retryableCode));
}

function formatRepositoryError(unknownError: unknown): string {
  if (isPermissionDeniedRepositoryError(unknownError)) {
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
  const enabled = options.enabled ?? true;
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [localShopCategoryRules] = useState<ShopCategoryRule[]>(() => loadSettings().shopCategoryRules ?? []);
  const [shopCategoryRules, setShopCategoryRules] = useState<ShopCategoryRule[]>([]);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionRevision, setSubscriptionRevision] = useState(0);
  const [cloudConnection, setCloudConnection] = useState<CloudConnectionState | null>(
    enabled && storageMode === "cloud" ? { status: "reconnecting" } : null,
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setError(null);
    if (storageMode === "cloud") {
      setCloudConnection((current) => ({
        status: "reconnecting",
        ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
      }));
    }
    const snapshot = await repository.getSnapshot();
    setCategories(snapshot.categories);
    setExpenses(snapshot.expenses);
    setShopCategoryRules(snapshot.shopCategoryRules);
    setStorageHealth(await checkStorageHealth(snapshot.expenses));
    if (storageMode === "cloud") {
      setCloudConnection({
        status: "online",
        lastSuccessfulSyncAt: new Date().toISOString(),
      });
    }
  }, [enabled, repository, storageMode]);

  const refreshAfterMutation = useCallback(async () => {
    if (!repository.subscribe) {
      await refresh();
    }
  }, [refresh, repository]);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    if (!enabled) {
      setCategories([]);
      setExpenses([]);
      setShopCategoryRules([]);
      setStorageHealth(null);
      setIsLoading(false);
      setError(null);
      setCloudConnection(null);
      return undefined;
    }

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
            (snapshot, metadata) => {
              if (!isActive) {
                return;
              }
              setCategories(snapshot.categories);
              setExpenses(snapshot.expenses);
              setShopCategoryRules(snapshot.shopCategoryRules);
              setError(null);
              setIsLoading(false);
              if (storageMode === "cloud") {
                setCloudConnection((current) => ({
                  status: metadata.fromCache ? "reconnecting" : "online",
                  ...(!metadata.fromCache
                    ? { lastSuccessfulSyncAt: new Date().toISOString() }
                    : current?.lastSuccessfulSyncAt
                      ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt }
                      : {}),
                }));
              }
              void checkStorageHealth(snapshot.expenses).then((health) => {
                if (isActive) {
                  setStorageHealth(health);
                }
              });
            },
            (unknownError) => {
              if (isActive) {
                if (storageMode === "cloud" && isRetryableRepositoryError(unknownError)) {
                  setCloudConnection((current) => ({
                    status: navigator.onLine ? "reconnecting" : "offline",
                    ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
                  }));
                } else {
                  setError(formatRepositoryError(unknownError));
                  if (storageMode === "cloud" && isPermissionDeniedRepositoryError(unknownError)) {
                    setCloudConnection((current) => ({
                      status: "permissionDenied",
                      ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
                    }));
                  }
                }
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
  }, [enabled, refresh, repository, storageMode, subscriptionRevision]);

  useEffect(() => {
    if (!enabled || storageMode !== "cloud") {
      setCloudConnection(null);
      return undefined;
    }

    const handleOffline = () => {
      setCloudConnection((current) => ({
        status: "offline",
        ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
      }));
    };
    const handleOnline = () => {
      setCloudConnection((current) => ({
        status: "reconnecting",
        ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
      }));
      setSubscriptionRevision((current) => current + 1);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, storageMode]);

  const assertWritable = useCallback(() => {
    if (!enabled) {
      throw new Error("クラウド家計簿へ接続してから操作してください。");
    }
    if (storageMode === "cloud" && cloudConnection?.status !== "online") {
      throw new Error("クラウドへ接続できていません。再接続してから保存してください。");
    }
  }, [cloudConnection?.status, enabled, storageMode]);

  const retryCloudConnection = useCallback(() => {
    if (!enabled) {
      return;
    }
    setCloudConnection((current) => ({
      status: "reconnecting",
      ...(current?.lastSuccessfulSyncAt ? { lastSuccessfulSyncAt: current.lastSuccessfulSyncAt } : {}),
    }));
    setSubscriptionRevision((current) => current + 1);
  }, [enabled]);

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
      assertWritable();
      await repository.saveExpense(createExpenseRecord(values, "manual"));
      await refreshAfterMutation();
    },
    [assertWritable, refreshAfterMutation, repository],
  );

  const addReceiptExpense = useCallback(
    async (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => {
      assertWritable();
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

      const expense = createExpenseRecord(values, "receipt", receiptImageId);
      try {
        await repository.saveExpense(expense);
        await refreshAfterMutation();
        return expense;
      } catch (unknownError) {
        if (receiptImageId) {
          await repository.deleteReceiptImage(receiptImageId).catch(() => undefined);
        }
        throw unknownError;
      }
    },
    [assertWritable, refreshAfterMutation, repository, settings.saveReceiptImages, storageMode],
  );

  const updateExpense = useCallback(
    async (expense: Expense, values: ExpenseFormValues) => {
      assertWritable();
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
    [assertWritable, refreshAfterMutation, repository],
  );

  const removeExpense = useCallback(
    async (expense: Expense) => {
      assertWritable();
      if (expense.receiptImageId) {
        await repository.deleteReceiptImage(expense.receiptImageId);
      }
      await repository.deleteExpense(expense.id, { expectedUpdatedAt: expense.updatedAt });
      await refreshAfterMutation();
    },
    [assertWritable, refreshAfterMutation, repository],
  );

  const updateSettings = useCallback((nextSettings: AppSettings) => {
    saveSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  const importBackup = useCallback(
    async (backup: BackupData, mode: BackupImportMode) => {
      assertWritable();
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
    [assertWritable, refreshAfterMutation, repository],
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
      assertWritable();
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
    [assertWritable, categories, refreshAfterMutation, repository],
  );

  const updateCategory = useCallback(
    async (category: Category, values: Pick<Category, "name" | "color">) => {
      assertWritable();
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
    [assertWritable, refreshAfterMutation, repository],
  );

  const removeCategory = useCallback(
    async (category: Category) => {
      assertWritable();
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
    [assertWritable, expenses, refreshAfterMutation, repository, shopCategoryRules],
  );

  const suggestCategoryForShop = useCallback(
    (shopName: string) => {
      const suggestion = findCategoryRuleForShop(shopCategoryRules, shopName) ?? findRecentCategoryForShop(expenses, shopName);
      return suggestion && categoryMap.has(suggestion.categoryId) ? suggestion : null;
    },
    [categoryMap, expenses, shopCategoryRules],
  );

  const upsertShopCategoryRule = useCallback(
    async (shopName: string, categoryId: string) => {
      assertWritable();
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
    [assertWritable, refreshAfterMutation, repository, shopCategoryRules],
  );

  const saveShopCategoryRule = useCallback(
    async (rule: ShopCategoryRule) => {
      assertWritable();
      await repository.saveShopCategoryRule(rule);
      await refreshAfterMutation();
    },
    [assertWritable, refreshAfterMutation, repository],
  );

  const removeShopCategoryRule = useCallback(
    async (rule: ShopCategoryRule) => {
      assertWritable();
      await repository.deleteShopCategoryRule(rule.id);
      await refreshAfterMutation();
    },
    [assertWritable, refreshAfterMutation, repository],
  );

  const resetData = useCallback(async () => {
    assertWritable();
    await repository.clearApplicationData();
    resetSettings();
    const defaultSettings = loadSettings();
    setSettings(defaultSettings);
    await refreshAfterMutation();
  }, [assertWritable, refreshAfterMutation, repository]);

  return {
    categories,
    expenses,
    settings: effectiveSettings,
    storageMode,
    cloudConnection,
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
    retryCloudConnection,
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
