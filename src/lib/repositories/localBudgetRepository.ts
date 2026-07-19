import {
  clearApplicationData,
  deleteCategory,
  deleteExpense,
  getCategories,
  getExpenses,
  importApplicationData,
  initializeDatabase,
  saveCategory,
  saveExpense,
  saveReceiptImage,
} from "../db";
import { loadSettings, saveSettings } from "../settings";
import type { BackupImportMode, Category, Expense, ShopCategoryRule } from "../../types";
import type { BudgetRepository, BudgetSnapshot } from "./budgetRepository";

async function getSnapshot(): Promise<BudgetSnapshot> {
  const [categories, expenses] = await Promise.all([getCategories(), getExpenses()]);
  return { categories, expenses, shopCategoryRules: loadSettings().shopCategoryRules ?? [] };
}

function saveLocalShopCategoryRules(shopCategoryRules: ShopCategoryRule[]): void {
  const settings = { ...loadSettings() };
  if (shopCategoryRules.length > 0) {
    settings.shopCategoryRules = shopCategoryRules;
  } else {
    delete settings.shopCategoryRules;
  }
  saveSettings(settings);
}

export const localBudgetRepository: BudgetRepository = {
  initialize: initializeDatabase,
  getSnapshot,
  saveExpense,
  deleteExpense,
  saveReceiptImage,
  saveCategory,
  deleteCategory,
  saveShopCategoryRule: async (rule) => {
    const currentRules = loadSettings().shopCategoryRules ?? [];
    saveLocalShopCategoryRules([rule, ...currentRules.filter((currentRule) => currentRule.id !== rule.id)]);
  },
  deleteShopCategoryRule: async (id) => {
    saveLocalShopCategoryRules((loadSettings().shopCategoryRules ?? []).filter((rule) => rule.id !== id));
  },
  importApplicationData: async (
    expenses: Expense[],
    categories: Category[],
    shopCategoryRules: ShopCategoryRule[],
    mode: BackupImportMode,
  ) => {
    await importApplicationData(expenses, categories, mode);
    const currentRules = mode === "replace" ? [] : loadSettings().shopCategoryRules ?? [];
    const importedRuleIds = new Set(shopCategoryRules.map((rule) => rule.id));
    saveLocalShopCategoryRules([
      ...shopCategoryRules,
      ...currentRules.filter((rule) => !importedRuleIds.has(rule.id)),
    ]);
  },
  clearApplicationData,
};
