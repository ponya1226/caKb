import type { AppSettings } from "../types";

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
