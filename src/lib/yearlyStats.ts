import type { Category, Expense } from "../types";
import { currentMonthKey, toMonthKey } from "./date";

export type YearlyMonthTotal = {
  monthKey: string;
  amount: number;
  count: number;
};

export type YearlyCategoryTotal = {
  id: string;
  name: string;
  color: string;
  amount: number;
  count: number;
};

export type YearlyStats = {
  year: string;
  expenses: Expense[];
  total: number;
  receiptTotal: number;
  receiptCount: number;
  monthTotals: YearlyMonthTotal[];
  categoryTotals: YearlyCategoryTotal[];
};

export function currentYearKey(): string {
  return currentMonthKey().slice(0, 4);
}

export function toYearKey(dateIso: string): string {
  return dateIso.slice(0, 4);
}

export function buildYearOptions(expenses: Expense[], fallbackYear = currentYearKey()): string[] {
  const years = new Set(expenses.map((expense) => toYearKey(expense.date)));
  years.add(fallbackYear);
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

export function formatYearLabel(year: string): string {
  return `${year}年`;
}

export function buildYearlyStats(expenses: Expense[], categories: Category[], year: string): YearlyStats {
  const yearExpenses = expenses.filter((expense) => toYearKey(expense.date) === year);
  const total = yearExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const receiptExpenses = yearExpenses.filter((expense) => expense.source === "receipt");
  const receiptTotal = receiptExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const monthTotals = Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${`${index + 1}`.padStart(2, "0")}`;
    const monthExpenses = yearExpenses.filter((expense) => toMonthKey(expense.date) === monthKey);
    return {
      monthKey,
      amount: monthExpenses.reduce((sum, expense) => sum + expense.amount, 0),
      count: monthExpenses.length,
    };
  });

  const categoryTotals = categories
    .map((category) => {
      const categoryExpenses = yearExpenses.filter((expense) => expense.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        color: category.color,
        amount: categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0),
        count: categoryExpenses.length,
      };
    })
    .filter((item) => item.amount > 0);

  return {
    year,
    expenses: yearExpenses,
    total,
    receiptTotal,
    receiptCount: receiptExpenses.length,
    monthTotals,
    categoryTotals,
  };
}
