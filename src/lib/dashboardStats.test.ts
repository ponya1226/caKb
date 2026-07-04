import { describe, expect, it } from "vitest";
import { buildDashboardStats, buildMonthOptions } from "./dashboardStats";
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

describe("dashboardStats", () => {
  it("builds month options from expenses and fallback month", () => {
    expect(
      buildMonthOptions(
        [
          createExpense({ id: "expense-june", date: "2026-06-10" }),
          createExpense({ id: "expense-april", date: "2026-04-10" }),
        ],
        "2026-07",
      ),
    ).toEqual(["2026-07", "2026-06", "2026-04"]);
  });

  it("calculates selected month totals and previous month diff", () => {
    const stats = buildDashboardStats(
      [
        createExpense({ id: "expense-current-food", date: "2026-07-01", amount: 800, categoryId: "food" }),
        createExpense({ id: "expense-current-daily", date: "2026-07-02", amount: 200, categoryId: "daily", source: "receipt" }),
        createExpense({ id: "expense-previous", date: "2026-06-20", amount: 500, categoryId: "food" }),
      ],
      categories,
      "2026-07",
    );

    expect(stats.currentTotal).toBe(1000);
    expect(stats.previousTotal).toBe(500);
    expect(stats.monthDiff).toBe(100);
    expect(stats.receiptTotal).toBe(200);
    expect(stats.categoryTotals).toEqual([
      { id: "food", name: "食費", value: 800, color: "#16a34a" },
      { id: "daily", name: "日用品", value: 200, color: "#0891b2" },
    ]);
    expect(stats.dailyTotals[0]).toEqual({ day: "1", amount: 800 });
    expect(stats.dailyTotals[1]).toEqual({ day: "2", amount: 200 });
  });
});
