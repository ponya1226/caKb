import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import {
  clearApplicationData,
  deleteExpense as deleteExpenseRecord,
  getCategories,
  getExpenses,
  initializeDatabase,
  saveExpense,
  saveReceiptImage,
} from "../lib/db";
import { createId } from "../lib/id";
import { loadSettings, resetSettings, saveSettings } from "../lib/settings";
import type { AppSettings, Category, Expense, ExpenseFormValues, ReceiptImage } from "../types";

type UseBudgetDataResult = {
  categories: Category[];
  expenses: Expense[];
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  categoryMap: Map<string, Category>;
  addManualExpense: (values: ExpenseFormValues) => Promise<void>;
  addReceiptExpense: (values: ExpenseFormValues, receipt?: Pick<ReceiptImage, "imageBlob" | "ocrText">) => Promise<void>;
  updateExpense: (expense: Expense, values: ExpenseFormValues) => Promise<void>;
  removeExpense: (expense: Expense) => Promise<void>;
  updateSettings: (settings: AppSettings) => void;
  resetData: () => Promise<void>;
  refresh: () => Promise<void>;
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [nextCategories, nextExpenses] = await Promise.all([getCategories(), getExpenses()]);
    setCategories(nextCategories);
    setExpenses(nextExpenses);
  }, []);

  useEffect(() => {
    let isActive = true;

    initializeDatabase()
      .then(() => refresh())
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
    isLoading,
    error,
    categoryMap,
    addManualExpense,
    addReceiptExpense,
    updateExpense,
    removeExpense,
    updateSettings,
    resetData,
    refresh,
  };
}
