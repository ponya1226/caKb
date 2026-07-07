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

  it("round-trips optional expense line items", () => {
    const expenseWithLineItems: Expense = {
      ...expenses[0],
      lineItems: [
        {
          id: "line-item-1",
          name: "Sample Item",
          amount: 168,
          source: "ocr",
          confidence: 0.9,
        },
      ],
    };

    const backup = parseBackupJson(buildBackupJson([expenseWithLineItems], categories, settings));

    expect(backup.expenses[0].lineItems).toEqual(expenseWithLineItems.lineItems);
  });

  it("accepts old backups without expense line items", () => {
    const backup = parseBackupJson(JSON.stringify({
      app: "caKb",
      version: 1,
      expenses,
      categories,
      settings,
    }));

    expect(backup.expenses[0].lineItems).toBeUndefined();
  });

  it("rejects unsupported backup data", () => {
    expect(() => parseBackupJson(JSON.stringify({ app: "other", version: 1 }))).toThrow(
      "対応していないバックアップ形式です",
    );
  });
});
