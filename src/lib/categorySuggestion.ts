import type { Expense, ReceiptCategorySuggestion } from "../types";

export function normalizeShopNameForCategory(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[ー―—‐・\-_/\\|()[\]{}"'“”.,:;!?@#$%^&*+=<>~`]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function findRecentCategoryForShop(expenses: Expense[], shopName: string): ReceiptCategorySuggestion | null {
  const normalizedShopName = normalizeShopNameForCategory(shopName);
  if (!normalizedShopName) {
    return null;
  }

  const matchedExpense = expenses.find(
    (expense) => normalizeShopNameForCategory(expense.shopName) === normalizedShopName,
  );

  if (!matchedExpense) {
    return null;
  }

  return {
    categoryId: matchedExpense.categoryId,
    matchedShopName: matchedExpense.shopName,
  };
}
