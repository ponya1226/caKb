import type { Category, Expense } from "../types";
import { addMonths, currentMonthKey, getDaysInMonth, toMonthKey } from "./date";

export type CategoryTotal = {
  id: string;
  name: string;
  value: number;
  color: string;
};

export type DailyTotal = {
  day: string;
  amount: number;
};

export type DashboardStats = {
  monthKey: string;
  previousMonthKey: string;
  currentMonthExpenses: Expense[];
  currentMonthReceiptExpenses: Expense[];
  currentTotal: number;
  previousTotal: number;
  receiptTotal: number;
  monthDiff: number;
  categoryTotals: CategoryTotal[];
  dailyTotals: DailyTotal[];
};

export function buildMonthOptions(expenses: Expense[], fallbackMonth = currentMonthKey()): string[] {
  const months = new Set(expenses.map((expense) => toMonthKey(expense.date)));
  months.add(fallbackMonth);
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function buildDashboardStats(expenses: Expense[], categories: Category[], monthKey: string): DashboardStats {
  const previousMonthKey = addMonths(monthKey, -1);
  const currentMonthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === monthKey);
  const previousMonthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === previousMonthKey);
  const currentMonthReceiptExpenses = currentMonthExpenses.filter((expense) => expense.source === "receipt");
  const currentTotal = currentMonthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const previousTotal = previousMonthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const receiptTotal = currentMonthReceiptExpenses.reduce((total, expense) => total + expense.amount, 0);
  const monthDiff = previousTotal === 0 ? Number.NaN : ((currentTotal - previousTotal) / previousTotal) * 100;

  const categoryTotals = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      value: currentMonthExpenses
        .filter((expense) => expense.categoryId === category.id)
        .reduce((total, expense) => total + expense.amount, 0),
      color: category.color,
    }))
    .filter((item) => item.value > 0);

  const daysInMonth = getDaysInMonth(monthKey);
  const dailyTotals = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${`${day}`.padStart(2, "0")}`;
    return {
      day: `${day}`,
      amount: currentMonthExpenses
        .filter((expense) => expense.date === date)
        .reduce((total, expense) => total + expense.amount, 0),
    };
  });

  return {
    monthKey,
    previousMonthKey,
    currentMonthExpenses,
    currentMonthReceiptExpenses,
    currentTotal,
    previousTotal,
    receiptTotal,
    monthDiff,
    categoryTotals,
    dailyTotals,
  };
}
