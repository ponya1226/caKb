import { describe, expect, it } from "vitest";
import { buildBackupJson, parseBackupJson } from "./backup";
import type { AppSettings, Category, Expense } from "../types";

const expenses: Expense[] = [
  {
    id: "expense-1",
    date: "2026-07-01",
    shopName: "Sample Store",
    amount: 481,
    categoryId: "food",
    memo: "memo",
    source: "receipt",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

const categories: Category[] = [
  { id: "food", name: "食費", color: "#16a34a", sortOrder: 10 },
];

const settings: AppSettings = {
  saveReceiptImages: false,
  shopCategoryRules: [
    {
      id: "shop_rule_1",
      shopName: "サンプルストア",
      normalizedShopName: "サンプルストア",
      categoryId: "food",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    },
  ],
};

describe("backup", () => {
  it("round-trips expenses, categories, and settings", () => {
    const backup = parseBackupJson(buildBackupJson(expenses, categories, settings));

    expect(backup.app).toBe("caKb");
    expect(backup.version).toBe(1);
    expect(backup.expenses).toEqual(expenses);
    expect(backup.categories).toEqual(categories);
    expect(backup.settings).toEqual(settings);
  });

  it("rejects unsupported backup data", () => {
    expect(() => parseBackupJson(JSON.stringify({ app: "other", version: 1 }))).toThrow(
      "対応していないバックアップ形式です",
    );
  });
});
