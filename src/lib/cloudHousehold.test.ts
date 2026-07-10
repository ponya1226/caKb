import { describe, expect, it } from "vitest";
import { buildHousehold, buildOwnerMember, toCloudCategory, toCloudExpense, toCloudShopCategoryRule } from "./cloudHousehold";
import type { Category, Expense, ShopCategoryRule, UserProfile } from "../types";

const expense: Expense = {
  id: "expense-1",
  date: "2026-07-05",
  shopName: "Sample Store",
  amount: 1200,
  categoryId: "food",
  memo: "",
  source: "manual",
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

const category: Category = {
  id: "food",
  name: "Food",
  color: "#16a34a",
  sortOrder: 10,
};

const rule: ShopCategoryRule = {
  id: "shop-rule-1",
  shopName: "Sample Store",
  normalizedShopName: "samplestore",
  categoryId: "food",
  createdAt: "2026-07-05T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("cloudHousehold", () => {
  it("builds household and owner member documents", () => {
    const household = buildHousehold(" Shared Ledger ", "user-1", "2026-07-05T00:00:00.000Z");
    const member = buildOwnerMember("household-1", "user-1", "2026-07-05T00:00:00.000Z");

    expect(household).toMatchObject({
      name: "Shared Ledger",
      ownerUid: "user-1",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    expect(household.id).toMatch(/^household_/);
    expect(member).toEqual({
      householdId: "household-1",
      uid: "user-1",
      role: "owner",
      joinedAt: "2026-07-05T00:00:00.000Z",
    });
  });

  it("maps local data into household scoped cloud documents", () => {
    expect(toCloudExpense(expense, "household-1", "user-1")).toEqual({
      ...expense,
      householdId: "household-1",
      createdByUid: "user-1",
      updatedByUid: "user-1",
    });

    expect(toCloudCategory(category, "household-1", "2026-07-05T00:00:00.000Z")).toEqual({
      ...category,
      householdId: "household-1",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });

    expect(toCloudShopCategoryRule(rule, "household-1")).toEqual({
      ...rule,
      householdId: "household-1",
    });
  });

  it("keeps expense line items as nested cloud fields", () => {
    const expenseWithLineItems: Expense = {
      ...expense,
      lineItems: [{ id: "line-item-1", name: "Sample Item", amount: 168, source: "manual" }],
    };

    expect(toCloudExpense(expenseWithLineItems, "household-1", "user-1").lineItems).toEqual(
      expenseWithLineItems.lineItems,
    );
  });

  it("allows user profiles to keep an active household pointer", () => {
    const profile: UserProfile = {
      uid: "user-1",
      displayName: "Sample User",
      email: "sample@example.invalid",
      activeHouseholdId: "household-1",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    };

    expect(profile.activeHouseholdId).toBe("household-1");
  });
});
