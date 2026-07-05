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
import type { BudgetRepository, BudgetSnapshot } from "./budgetRepository";

async function getSnapshot(): Promise<BudgetSnapshot> {
  const [categories, expenses] = await Promise.all([getCategories(), getExpenses()]);
  return { categories, expenses };
}

export const localBudgetRepository: BudgetRepository = {
  initialize: initializeDatabase,
  getSnapshot,
  saveExpense,
  deleteExpense,
  saveReceiptImage,
  saveCategory,
  deleteCategory,
  importApplicationData,
  clearApplicationData,
};
