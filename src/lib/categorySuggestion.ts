import { createId } from "./id";
import type { Expense, ReceiptCategorySuggestion, ShopCategoryRule } from "../types";

const MIN_RELATED_SHOP_PREFIX_LENGTH = 4;
const MIN_RELATED_SHOP_PREFIX_RATIO = 0.45;

export function normalizeShopNameForCategory(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[ー―—‐・\-_/\\|()[\]{}"'“”.,:;!?@#$%^&*+=<>~`]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function getCommonPrefixLength(firstValue: string, secondValue: string): number {
  const maxLength = Math.min(firstValue.length, secondValue.length);
  let length = 0;

  while (length < maxLength && firstValue[length] === secondValue[length]) {
    length += 1;
  }

  return length;
}

function hasRelatedShopPrefix(savedShopName: string, targetShopName: string): boolean {
  const commonPrefixLength = getCommonPrefixLength(savedShopName, targetShopName);
  const shortestLength = Math.min(savedShopName.length, targetShopName.length);
  if (shortestLength === 0) {
    return false;
  }

  return (
    commonPrefixLength >= MIN_RELATED_SHOP_PREFIX_LENGTH &&
    commonPrefixLength / shortestLength >= MIN_RELATED_SHOP_PREFIX_RATIO
  );
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

  return (shortest.length >= 6 && longest.includes(shortest)) || hasRelatedShopPrefix(savedShopName, targetShopName);
}

export function createShopCategoryRule(shopName: string, categoryId: string, now = new Date().toISOString()): ShopCategoryRule | null {
  const trimmedShopName = shopName.trim();
  const normalizedShopName = normalizeShopNameForCategory(trimmedShopName);
  if (!trimmedShopName || !normalizedShopName || !categoryId) {
    return null;
  }

  return {
    id: createId("shop_rule"),
    shopName: trimmedShopName,
    normalizedShopName,
    categoryId,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeShopCategoryRule(rule: ShopCategoryRule): ShopCategoryRule | null {
  const normalizedShopName = normalizeShopNameForCategory(rule.shopName);
  if (!rule.id || !normalizedShopName || !rule.categoryId) {
    return null;
  }

  return {
    ...rule,
    shopName: rule.shopName.trim(),
    normalizedShopName,
  };
}

export function upsertShopCategoryRule(
  rules: ShopCategoryRule[] | undefined,
  shopName: string,
  categoryId: string,
  now = new Date().toISOString(),
): ShopCategoryRule[] {
  const newRule = createShopCategoryRule(shopName, categoryId, now);
  if (!newRule) {
    return rules ?? [];
  }

  const currentRules = rules ?? [];
  const matchedRule = currentRules.find((rule) =>
    isSameOrRelatedShopName(rule.normalizedShopName || normalizeShopNameForCategory(rule.shopName), newRule.normalizedShopName),
  );

  if (!matchedRule) {
    return [newRule, ...currentRules];
  }

  return currentRules.map((rule) =>
    rule.id === matchedRule.id
      ? {
          ...rule,
          shopName: newRule.shopName,
          normalizedShopName: newRule.normalizedShopName,
          categoryId,
          updatedAt: now,
        }
      : rule,
  );
}

export function findCategoryRuleForShop(rules: ShopCategoryRule[] | undefined, shopName: string): ReceiptCategorySuggestion | null {
  const normalizedShopName = normalizeShopNameForCategory(shopName);
  if (!normalizedShopName) {
    return null;
  }

  const matchedRule = (rules ?? []).find((rule) =>
    isSameOrRelatedShopName(rule.normalizedShopName || normalizeShopNameForCategory(rule.shopName), normalizedShopName),
  );

  if (!matchedRule) {
    return null;
  }

  return {
    categoryId: matchedRule.categoryId,
    matchedShopName: matchedRule.shopName,
    source: "rule",
    ruleId: matchedRule.id,
  };
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
    source: "history",
  };
}
