import { describe, expect, it } from "vitest";
import { buildYearlyStats, buildYearOptions } from "./yearlyStats";
import type { Category, Expense } from "../types";

const categories: Category[] = [
  { id: "food", name: "食費", color: "#16a34a", sortOrder: 10 },
  { id: "daily", name: "日用品", color: "#0891b2", sortOrder: 20 },
];

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

describe("yearlyStats", () => {
  it("builds year options from expenses and fallback year", () => {
    expect(
      buildYearOptions(
        [
          createExpense({ id: "expense-2025", date: "2025-06-10" }),
          createExpense({ id: "expense-2024", date: "2024-04-10" }),
        ],
        "2026",
      ),
    ).toEqual(["2026", "2025", "2024"]);
  });

  it("calculates yearly totals by month and category", () => {
    const stats = buildYearlyStats(
      [
        createExpense({ id: "expense-food", date: "2026-01-10", amount: 800, categoryId: "food" }),
        createExpense({ id: "expense-daily", date: "2026-07-02", amount: 200, categoryId: "daily", source: "receipt" }),
        createExpense({ id: "expense-other-year", date: "2025-12-20", amount: 500, categoryId: "food" }),
      ],
      categories,
      "2026",
    );

    expect(stats.total).toBe(1000);
    expect(stats.receiptTotal).toBe(200);
    expect(stats.receiptCount).toBe(1);
    expect(stats.monthTotals[0]).toEqual({ monthKey: "2026-01", amount: 800, count: 1 });
    expect(stats.monthTotals[6]).toEqual({ monthKey: "2026-07", amount: 200, count: 1 });
    expect(stats.categoryTotals).toEqual([
      { id: "food", name: "食費", color: "#16a34a", amount: 800, count: 1 },
      { id: "daily", name: "日用品", color: "#0891b2", amount: 200, count: 1 },
    ]);
  });
});
