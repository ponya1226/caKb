import type { AppSettings, BackupData, Category, Expense } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isExpense(value: unknown): value is Expense {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.shopName === "string" &&
    typeof value.amount === "number" &&
    Number.isFinite(value.amount) &&
    typeof value.categoryId === "string" &&
    typeof value.memo === "string" &&
    (value.source === "manual" || value.source === "receipt") &&
    (value.receiptImageId === undefined || typeof value.receiptImageId === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isCategory(value: unknown): value is Category {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    typeof value.sortOrder === "number" &&
    Number.isFinite(value.sortOrder)
  );
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.saveReceiptImages === "boolean";
}

function isValidCrop(value: unknown): value is NonNullable<AppSettings["lastOcrCrop"]> {
  if (!isRecord(value)) {
    return false;
  }

  return ["top", "right", "bottom", "left"].every((key) => {
    const nextValue = value[key];
    return typeof nextValue === "number" && Number.isFinite(nextValue) && nextValue >= 0 && nextValue <= 100;
  });
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    saveReceiptImages: settings.saveReceiptImages,
    ...(isValidCrop(settings.lastOcrCrop) ? { lastOcrCrop: settings.lastOcrCrop } : {}),
  };
}

export function buildBackupData(expenses: Expense[], categories: Category[], settings: AppSettings): BackupData {
  return {
    app: "caKb",
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses,
    categories,
    settings: normalizeSettings(settings),
  };
}

export function buildBackupJson(expenses: Expense[], categories: Category[], settings: AppSettings): string {
  return JSON.stringify(buildBackupData(expenses, categories, settings), null, 2);
}

export function parseBackupJson(rawValue: string): BackupData {
  const parsedValue = JSON.parse(rawValue) as unknown;

  if (!isRecord(parsedValue) || parsedValue.app !== "caKb" || parsedValue.version !== 1) {
    throw new Error("対応していないバックアップ形式です");
  }

  if (!Array.isArray(parsedValue.expenses) || !parsedValue.expenses.every(isExpense)) {
    throw new Error("支出データの形式が正しくありません");
  }

  if (!Array.isArray(parsedValue.categories) || !parsedValue.categories.every(isCategory)) {
    throw new Error("カテゴリデータの形式が正しくありません");
  }

  if (!isAppSettings(parsedValue.settings)) {
    throw new Error("設定データの形式が正しくありません");
  }

  return {
    app: "caKb",
    version: 1,
    exportedAt: typeof parsedValue.exportedAt === "string" ? parsedValue.exportedAt : new Date().toISOString(),
    expenses: parsedValue.expenses,
    categories: parsedValue.categories,
    settings: normalizeSettings(parsedValue.settings),
  };
}

export function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
