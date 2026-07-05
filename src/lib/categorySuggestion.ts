import type { Expense, ReceiptCategorySuggestion } from "../types";

export function normalizeShopNameForCategory(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[ー―—‐・\-_/\\|()[\]{}"'“”.,:;!?@#$%^&*+=<>~`]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isSameOrRelatedShopName(savedShopName: string, targetShopName: string): boolean {
  if (!savedShopName || !targetShopName) {
    return false;
  }

  if (savedShopName === targetShopName) {
    return true;
  }

  const shortest = savedShopName.length <= targetShopName.length ? savedShopName : targetShopName;
  const longest = savedShopName.length > targetShopName.length ? savedShopName : targetShopName;

  return shortest.length >= 6 && longest.includes(shortest);
}

export function findRecentCategoryForShop(expenses: Expense[], shopName: string): ReceiptCategorySuggestion | null {
  const normalizedShopName = normalizeShopNameForCategory(shopName);
  if (!normalizedShopName) {
    return null;
  }

  const matchedExpense = expenses.find(
    (expense) => isSameOrRelatedShopName(normalizeShopNameForCategory(expense.shopName), normalizedShopName),
  );

  if (!matchedExpense) {
    return null;
  }

  return {
    categoryId: matchedExpense.categoryId,
    matchedShopName: matchedExpense.shopName,
  };
}
