import { describe, expect, it } from "vitest";
import {
  findCategoryRuleForShop,
  findRecentCategoryForShop,
  normalizeShopNameForCategory,
  upsertShopCategoryRule,
} from "./categorySuggestion";
import type { Expense, ShopCategoryRule } from "../types";

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
      source: "history",
    });
  });

  it("matches brand-only and branch-combined shop names for category learning", () => {
    const result = findRecentCategoryForShop(
      [
        createExpense({ id: "expense-tea", shopName: "SAMPLE TEA 架空新都心店", categoryId: "entertainment" }),
      ],
      "SAMPLE TEA",
    );

    expect(result).toEqual({
      categoryId: "entertainment",
      matchedShopName: "SAMPLE TEA 架空新都心店",
      source: "history",
    });
  });

  it("matches saved categories across different branches of the same shop brand", () => {
    const result = findRecentCategoryForShop(
      [
        createExpense({ id: "expense-branch", shopName: "サンプル茶 架空新都心店", categoryId: "entertainment" }),
      ],
      "サンプル茶 海岸店",
    );

    expect(result).toEqual({
      categoryId: "entertainment",
      matchedShopName: "サンプル茶 架空新都心店",
      source: "history",
    });
  });

  it("matches explicit shop category rules before saved expense history", () => {
    const rules: ShopCategoryRule[] = [
      {
        id: "shop_rule_1",
        shopName: "サンプルストア 駅前店",
        normalizedShopName: "サンプルストア駅前店",
        categoryId: "daily",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ];

    expect(findCategoryRuleForShop(rules, "サンプルストア")).toEqual({
      categoryId: "daily",
      matchedShopName: "サンプルストア 駅前店",
      source: "rule",
      ruleId: "shop_rule_1",
    });
  });

  it("matches explicit shop category rules across different branches of the same shop brand", () => {
    const rules = upsertShopCategoryRule([], "サンプル茶 架空新都心店", "entertainment", "2026-07-01T00:00:00.000Z");

    expect(findCategoryRuleForShop(rules, "サンプル茶 海岸店")).toEqual({
      categoryId: "entertainment",
      matchedShopName: "サンプル茶 架空新都心店",
      source: "rule",
      ruleId: rules[0].id,
    });
  });

  it("upserts explicit shop category rules for related shop names", () => {
    const firstRules = upsertShopCategoryRule([], "SAMPLE TEA 架空新都心店", "entertainment", "2026-07-01T00:00:00.000Z");
    const nextRules = upsertShopCategoryRule(firstRules, "SAMPLE TEA", "food", "2026-07-02T00:00:00.000Z");

    expect(nextRules).toHaveLength(1);
    expect(nextRules[0]).toEqual({
      ...firstRules[0],
      shopName: "SAMPLE TEA",
      normalizedShopName: "sampletea",
      categoryId: "food",
      updatedAt: "2026-07-02T00:00:00.000Z",
    });
  });

  it("returns null when there is no usable shop match", () => {
    expect(findRecentCategoryForShop([createExpense({ shopName: "別店舗" })], "サンプルストア")).toBeNull();
    expect(findRecentCategoryForShop([createExpense({ shopName: "サンプルストア" })], "")).toBeNull();
    expect(findRecentCategoryForShop([createExpense({ shopName: "AB店" })], "AB商店")).toBeNull();
    expect(findCategoryRuleForShop([], "サンプルストア")).toBeNull();
  });
});
