import { describe, expect, it } from "vitest";
import {
  householdInvitePath,
  householdCategoriesPath,
  householdExpensesPath,
  householdMemberPath,
  householdPath,
  householdSheetSyncSettingsPath,
  householdShopCategoryRulesPath,
  userProfilePath,
} from "./firestorePaths";

describe("firestorePaths", () => {
  it("builds a top-level invite path", () => {
    expect(householdInvitePath("ABCDEFGH")).toBe("householdInvites/ABCDEFGH");
  });
  it("builds stable document and collection paths for household scoped data", () => {
    expect(userProfilePath("user-1")).toBe("users/user-1");
    expect(householdPath("household-1")).toBe("households/household-1");
    expect(householdMemberPath("household-1", "user-1")).toBe("households/household-1/members/user-1");
    expect(householdExpensesPath("household-1")).toBe("households/household-1/expenses");
    expect(householdCategoriesPath("household-1")).toBe("households/household-1/categories");
    expect(householdShopCategoryRulesPath("household-1")).toBe("households/household-1/shopCategoryRules");
    expect(householdSheetSyncSettingsPath("household-1")).toBe("households/household-1/sheetSyncSettings/default");
  });
});
