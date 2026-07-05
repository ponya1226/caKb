import type { AppSettings } from "../types";
import { normalizeShopCategoryRule } from "./categorySuggestion";

const SETTINGS_KEY = "local-kakeibo-settings-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  saveReceiptImages: false,
};

function isValidCrop(value: unknown): value is NonNullable<AppSettings["lastOcrCrop"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["top", "right", "bottom", "left"].every((key) => {
    const nextValue = candidate[key];
    return typeof nextValue === "number" && Number.isFinite(nextValue) && nextValue >= 0 && nextValue <= 100;
  });
}

function normalizeShopCategoryRules(value: unknown): NonNullable<AppSettings["shopCategoryRules"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((rule): rule is NonNullable<AppSettings["shopCategoryRules"]>[number] => {
      if (!rule || typeof rule !== "object") {
        return false;
      }

      const candidate = rule as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.shopName === "string" &&
        typeof candidate.normalizedShopName === "string" &&
        typeof candidate.categoryId === "string" &&
        typeof candidate.createdAt === "string" &&
        typeof candidate.updatedAt === "string"
      );
    })
    .map((rule) => normalizeShopCategoryRule(rule))
    .filter((rule): rule is NonNullable<AppSettings["shopCategoryRules"]>[number] => Boolean(rule));
}

export function loadSettings(): AppSettings {
  try {
    const rawValue = localStorage.getItem(SETTINGS_KEY);
    if (!rawValue) {
      return DEFAULT_SETTINGS;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<AppSettings>;
    return {
      saveReceiptImages: parsedValue.saveReceiptImages ?? DEFAULT_SETTINGS.saveReceiptImages,
      ...(isValidCrop(parsedValue.lastOcrCrop) ? { lastOcrCrop: parsedValue.lastOcrCrop } : {}),
      ...(normalizeShopCategoryRules(parsedValue.shopCategoryRules).length > 0
        ? { shopCategoryRules: normalizeShopCategoryRules(parsedValue.shopCategoryRules) }
        : {}),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function resetSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
}
