import { describe, expect, it } from "vitest";
import { filterExpenses, parseOptionalAmount } from "./expenseFilters";
import type { Category, Expense } from "../types";

const categories: Category[] = [
  { id: "food", name: "食費", color: "#16a34a", sortOrder: 10 },
  { id: "daily", name: "日用品", color: "#0891b2", sortOrder: 20 },
];
const categoryMap = new Map(categories.map((category) => [category.id, category]));

function createExpense(overrides: Partial<Expense>): Expense {
  return {
    id: "expense-1",
    date: "2026-07-01",
    shopName: "Sample Store",
    amount: 100,
    categoryId: "food",
    memo: "",
    source: "manual",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const expenses = [
  createExpense({
    id: "expense-market",
    date: "2026-07-03",
    shopName: "Sample Market",
    amount: 500,
    categoryId: "food",
    memo: "夕食",
  }),
  createExpense({
    id: "expense-drugstore",
    date: "2026-07-15",
    shopName: "DAILY DRUG",
    amount: 1200,
    categoryId: "daily",
    memo: "洗剤",
  }),
  createExpense({
    id: "expense-late",
    date: "2026-07-28",
    shopName: "Late Store",
    amount: 3000,
    categoryId: "food",
    memo: "",
  }),
];

describe("expenseFilters", () => {
  it("applies search, category, date, and amount filters with AND conditions", () => {
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "daily",
        categoryId: "daily",
        dateFrom: "2026-07-10",
        dateTo: "2026-07-20",
        minAmount: 1000,
        maxAmount: 1500,
      }).map((expense) => expense.id),
    ).toEqual(["expense-drugstore"]);
  });

  it("includes date and amount boundary values", () => {
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "",
        categoryId: "all",
        dateFrom: "2026-07-03",
        dateTo: "2026-07-15",
        minAmount: 500,
        maxAmount: 1200,
      }).map((expense) => expense.id),
    ).toEqual(["expense-market", "expense-drugstore"]);
  });

  it("searches shop, memo, and category without case sensitivity", () => {
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "daily",
        categoryId: "all",
      }).map((expense) => expense.id),
    ).toEqual(["expense-drugstore"]);
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "夕食",
        categoryId: "all",
      }).map((expense) => expense.id),
    ).toEqual(["expense-market"]);
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "食費",
        categoryId: "all",
      }).map((expense) => expense.id),
    ).toEqual(["expense-market", "expense-late"]);
  });

  it("returns all expenses when optional filters are empty", () => {
    expect(
      filterExpenses(expenses, categoryMap, {
        searchQuery: "",
        categoryId: "all",
      }),
    ).toEqual(expenses);
  });

  it("parses optional non-negative integer amounts safely", () => {
    expect(parseOptionalAmount("")).toBeUndefined();
    expect(parseOptionalAmount(" 1500 ")).toBe(1500);
    expect(parseOptionalAmount("1200.9")).toBe(1200);
    expect(parseOptionalAmount("-1")).toBeUndefined();
    expect(parseOptionalAmount("invalid")).toBeUndefined();
  });
});
