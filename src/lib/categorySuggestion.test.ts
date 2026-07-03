import { describe, expect, it } from "vitest";
import { findRecentCategoryForShop, normalizeShopNameForCategory } from "./categorySuggestion";
import type { Expense } from "../types";

function createExpense(overrides: Partial<Expense>): Expense {
  return {
    id: "expense-1",
    date: "2026-07-01",
    shopName: "サンプルストア",
    amount: 100,
    categoryId: "food",
    memo: "",
    source: "receipt",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("categorySuggestion", () => {
  it("normalizes shop names for category learning", () => {
    expect(normalizeShopNameForCategory("サンプル ストア")).toBe("サンプルストア");
    expect(normalizeShopNameForCategory("Sample-Store")).toBe("samplestore");
  });

  it("returns the first matching saved category for the same shop", () => {
    const result = findRecentCategoryForShop(
      [
        createExpense({ id: "expense-new", shopName: "サンプル ストア", categoryId: "daily" }),
        createExpense({ id: "expense-old", shopName: "サンプルストア", categoryId: "food" }),
      ],
      "サンプルストア",
    );

    expect(result).toEqual({
      categoryId: "daily",
      matchedShopName: "サンプル ストア",
    });
  });

  it("returns null when there is no usable shop match", () => {
    expect(findRecentCategoryForShop([createExpense({ shopName: "別店舗" })], "サンプルストア")).toBeNull();
    expect(findRecentCategoryForShop([createExpense({ shopName: "サンプルストア" })], "")).toBeNull();
  });
});
