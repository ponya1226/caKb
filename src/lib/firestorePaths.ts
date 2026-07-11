const HOUSEHOLDS = "households";
const MEMBERS = "members";
const EXPENSES = "expenses";
const CATEGORIES = "categories";
const SHOP_CATEGORY_RULES = "shopCategoryRules";
const SHEET_SYNC_SETTINGS = "sheetSyncSettings";
const USERS = "users";
const HOUSEHOLD_INVITES = "householdInvites";

export function userProfilePath(uid: string): string {
  return `${USERS}/${uid}`;
}

export function householdPath(householdId: string): string {
  return `${HOUSEHOLDS}/${householdId}`;
}

export function householdMemberPath(householdId: string, uid: string): string {
  return `${householdPath(householdId)}/${MEMBERS}/${uid}`;
}

export function householdMembersPath(householdId: string): string {
  return `${householdPath(householdId)}/${MEMBERS}`;
}

export function householdInvitePath(code: string): string {
  return `${HOUSEHOLD_INVITES}/${code}`;
}

export function householdExpensesPath(householdId: string): string {
  return `${householdPath(householdId)}/${EXPENSES}`;
}

export function householdCategoriesPath(householdId: string): string {
  return `${householdPath(householdId)}/${CATEGORIES}`;
}

export function householdShopCategoryRulesPath(householdId: string): string {
  return `${householdPath(householdId)}/${SHOP_CATEGORY_RULES}`;
}

export function householdSheetSyncSettingsPath(householdId: string): string {
  return `${householdPath(householdId)}/${SHEET_SYNC_SETTINGS}/default`;
}
