import type { Category, Expense } from "../types";

export type ExpenseListFilters = {
  searchQuery: string;
  categoryId: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
};

export function parseOptionalAmount(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return Math.floor(parsed);
}

export function filterExpenses(
  expenses: Expense[],
  categoryMap: Map<string, Category>,
  filters: ExpenseListFilters,
): Expense[] {
  const normalizedSearchQuery = filters.searchQuery.trim().toLocaleLowerCase();

  return expenses.filter((expense) => {
    if (filters.categoryId !== "all" && expense.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.dateFrom && expense.date < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && expense.date > filters.dateTo) {
      return false;
    }

    if (filters.minAmount !== undefined && expense.amount < filters.minAmount) {
      return false;
    }

    if (filters.maxAmount !== undefined && expense.amount > filters.maxAmount) {
      return false;
    }

    if (!normalizedSearchQuery) {
      return true;
    }

    const category = categoryMap.get(expense.categoryId);
    const searchableText = [expense.shopName, expense.memo, category?.name ?? ""]
      .join(" ")
      .toLocaleLowerCase();
    return searchableText.includes(normalizedSearchQuery);
  });
}
