import { describe, expect, it } from "vitest";
import {
  assertExpectedExpenseVersion,
  fromCloudCategory,
  fromCloudExpense,
  fromCloudShopCategoryRule,
} from "./firestoreBudgetRepository";
import type { CloudCategory, CloudExpense, CloudShopCategoryRule } from "../../types";

describe("firestoreBudgetRepository", () => {
  it("maps a cloud expense back to the existing local expense shape", () => {
    const cloudExpense: CloudExpense = {
      id: "expense_1",
      householdId: "household_1",
      createdByUid: "user_1",
      updatedByUid: "user_2",
      date: "2026-07-10",
      shopName: "テストストア",
      amount: 1200,
      categoryId: "food",
      memo: "memo",
      source: "receipt",
      receiptImageId: "receipt_1",
      lineItems: [
        {
          id: "line_1",
          name: "品目A",
          amount: 1000,
          source: "ocr",
          confidence: 0.8,
        },
      ],
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };

    expect(fromCloudExpense(cloudExpense)).toEqual({
      id: "expense_1",
      date: "2026-07-10",
      shopName: "テストストア",
      amount: 1200,
      categoryId: "food",
      memo: "memo",
      source: "receipt",
      receiptImageId: "receipt_1",
      createdByUid: "user_1",
      updatedByUid: "user_2",
      lineItems: [
        {
          id: "line_1",
          name: "品目A",
          amount: 1000,
          source: "ocr",
          confidence: 0.8,
        },
      ],
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    });
  });

  it("maps a cloud category back to the existing local category shape", () => {
    const cloudCategory: CloudCategory = {
      id: "category_1",
      householdId: "household_1",
      name: "食費",
      color: "#0f766e",
      sortOrder: 10,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };

    expect(fromCloudCategory(cloudCategory)).toEqual({
      id: "category_1",
      name: "食費",
      color: "#0f766e",
      sortOrder: 10,
    });
  });

  it("maps a shared shop category rule back to the existing rule shape", () => {
    const cloudRule: CloudShopCategoryRule = {
      id: "rule_1",
      householdId: "household_1",
      shopName: "サンプルストア",
      normalizedShopName: "サンプルストア",
      categoryId: "food",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T01:00:00.000Z",
    };

    expect(fromCloudShopCategoryRule(cloudRule)).toEqual({
      id: "rule_1",
      shopName: "サンプルストア",
      normalizedShopName: "サンプルストア",
      categoryId: "food",
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T01:00:00.000Z",
    });
  });

  it("rejects an expense mutation when the stored version changed", () => {
    expect(() =>
      assertExpectedExpenseVersion("2026-07-10T02:00:00.000Z", "2026-07-10T01:00:00.000Z"),
    ).toThrow("別の利用者が更新しました");
    expect(() =>
      assertExpectedExpenseVersion("2026-07-10T01:00:00.000Z", "2026-07-10T01:00:00.000Z"),
    ).not.toThrow();
  });
});
