import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { SheetSyncSettings } from "../types";
import { householdSheetSyncSettingsPath } from "./firestorePaths";
import { getConfiguredGoogleVisionProxyUrl } from "./googleVisionOcr";

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;
const SPREADSHEET_URL_PATTERN = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,100})/;

export const GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "cakb-vision-proxy@cakb-dev.iam.gserviceaccount.com";

type SheetExportResponse = {
  spreadsheetId?: unknown;
  sheetTitle?: unknown;
  exportedExpenses?: unknown;
  lastSyncedAt?: unknown;
};

type SheetExportErrorResponse = {
  code?: unknown;
};

export type GoogleSheetsExportResult = {
  spreadsheetId: string;
  sheetTitle: string;
  exportedExpenses: number;
  lastSyncedAt: string;
};

export type GoogleSheetsExportOptions = {
  proxyUrl?: string | null;
  authToken: string;
  fetcher?: typeof fetch;
};

function normalizeUrl(value: string | undefined | null): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

export function extractSpreadsheetId(value: string): string | null {
  const trimmedValue = value.trim();
  if (SPREADSHEET_ID_PATTERN.test(trimmedValue)) {
    return trimmedValue;
  }
  return SPREADSHEET_URL_PATTERN.exec(trimmedValue)?.[1] ?? null;
}

export function deriveGoogleSheetsProxyUrl(ocrProxyUrl: string | null): string | null {
  if (!ocrProxyUrl) {
    return null;
  }

  try {
    const url = new URL(ocrProxyUrl);
    url.pathname = url.pathname.endsWith("/api/ocr")
      ? `${url.pathname.slice(0, -"/api/ocr".length)}/api/sheets/export`
      : "/api/sheets/export";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function getConfiguredGoogleSheetsProxyUrl(): string | null {
  return normalizeUrl(import.meta.env.VITE_GOOGLE_SHEETS_PROXY_URL)
    ?? deriveGoogleSheetsProxyUrl(getConfiguredGoogleVisionProxyUrl());
}

function normalizeExportResponse(value: SheetExportResponse): GoogleSheetsExportResult {
  if (
    typeof value.spreadsheetId !== "string"
    || typeof value.sheetTitle !== "string"
    || typeof value.exportedExpenses !== "number"
    || !Number.isInteger(value.exportedExpenses)
    || typeof value.lastSyncedAt !== "string"
  ) {
    throw new Error("Google Sheets出力の応答形式が正しくありません");
  }

  return {
    spreadsheetId: value.spreadsheetId,
    sheetTitle: value.sheetTitle,
    exportedExpenses: value.exportedExpenses,
    lastSyncedAt: value.lastSyncedAt,
  };
}

export async function exportExpensesToGoogleSheets(
  spreadsheetInput: string,
  options: GoogleSheetsExportOptions,
): Promise<GoogleSheetsExportResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput);
  if (!spreadsheetId) {
    throw new Error("GoogleスプレッドシートのURLまたはIDを確認してください");
  }

  const proxyUrl = normalizeUrl(options.proxyUrl ?? getConfiguredGoogleSheetsProxyUrl());
  if (!proxyUrl) {
    throw new Error("Google Sheets出力Proxyが設定されていません");
  }

  const response = await (options.fetcher ?? fetch)(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.authToken}`,
    },
    body: JSON.stringify({ spreadsheetId }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as SheetExportErrorResponse | null;
    if (response.status === 401) {
      throw new Error("ログイン期限が切れています。再ログインしてください");
    }
    if (response.status === 403 || errorBody?.code === "forbidden") {
      throw new Error("Google Sheets出力はクラウド家計簿の管理者だけが実行できます");
    }
    if (response.status === 429) {
      throw new Error("Google Sheets出力を続けて実行しています。少し待ってから再試行してください");
    }
    if (errorBody?.code === "spreadsheet_unavailable") {
      throw new Error("スプレッドシートを開けません。URLとサービスアカウントへの編集権限を確認してください");
    }
    throw new Error("Google Sheetsへの出力に失敗しました。Sheets API設定と共有権限を確認してください");
  }

  return normalizeExportResponse(await response.json() as SheetExportResponse);
}

export async function loadSheetSyncSettings(
  firestore: Firestore,
  householdId: string,
): Promise<SheetSyncSettings | null> {
  const snapshot = await getDoc(doc(firestore, householdSheetSyncSettingsPath(householdId)));
  if (!snapshot.exists()) {
    return null;
  }

  const value = snapshot.data() as Partial<SheetSyncSettings>;
  if (
    value.householdId !== householdId
    || typeof value.spreadsheetId !== "string"
    || typeof value.enabled !== "boolean"
    || typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    householdId,
    spreadsheetId: value.spreadsheetId,
    enabled: value.enabled,
    updatedAt: value.updatedAt,
    ...(typeof value.lastSyncedAt === "string" ? { lastSyncedAt: value.lastSyncedAt } : {}),
    ...(typeof value.lastExportedExpenseCount === "number" && Number.isInteger(value.lastExportedExpenseCount)
      ? { lastExportedExpenseCount: value.lastExportedExpenseCount }
      : {}),
  };
}

export function buildGoogleSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}
