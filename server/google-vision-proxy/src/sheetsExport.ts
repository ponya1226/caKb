import { GoogleAuth } from "google-auth-library";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const SHEET_TITLE = "caKb支出";
export const SHEET_HEADERS = [
  "支出ID",
  "日付",
  "店舗名",
  "カテゴリ",
  "金額",
  "メモ",
  "登録方法",
  "品目明細",
  "登録者",
  "更新日時",
] as const;

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

type FirestoreRecord = Record<string, unknown>;
type SheetCell = string | number;

type SpreadsheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

export type GoogleSheetsWriter = {
  replaceRows: (spreadsheetId: string, rows: SheetCell[][]) => Promise<void>;
};

export type GoogleSheetsExportResult = {
  spreadsheetId: string;
  sheetTitle: string;
  exportedExpenses: number;
  lastSyncedAt: string;
};

export class GoogleSheetsExportError extends Error {
  constructor(
    public readonly code: "forbidden" | "invalid_spreadsheet_id" | "spreadsheet_unavailable" | "export_failed",
  ) {
    super(code);
  }
}

export function isValidSpreadsheetId(value: unknown): value is string {
  return typeof value === "string" && SPREADSHEET_ID_PATTERN.test(value.trim());
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function lineItemsValue(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const record = item as FirestoreRecord;
      const name = stringValue(record.name);
      const amount = numberValue(record.amount);
      return name && amount !== 0 ? `${name} (${amount.toLocaleString("ja-JP")}円)` : "";
    })
    .filter(Boolean)
    .join(" / ");
}

export function buildExpenseSheetRows(
  expenses: FirestoreRecord[],
  categories: FirestoreRecord[],
  members: FirestoreRecord[],
): SheetCell[][] {
  const categoryNames = new Map(
    categories
      .map((category) => [stringValue(category.id), stringValue(category.name)] as const)
      .filter(([id]) => Boolean(id)),
  );
  const memberNames = new Map(
    members
      .map((member) => [stringValue(member.uid), stringValue(member.displayName)] as const)
      .filter(([uid]) => Boolean(uid)),
  );

  const sortedExpenses = [...expenses].sort((left, right) => {
    const dateComparison = stringValue(right.date).localeCompare(stringValue(left.date));
    return dateComparison || stringValue(right.updatedAt).localeCompare(stringValue(left.updatedAt));
  });

  return [
    [...SHEET_HEADERS],
    ...sortedExpenses.map((expense) => {
      const categoryId = stringValue(expense.categoryId);
      const createdByUid = stringValue(expense.createdByUid);
      return [
        stringValue(expense.id),
        stringValue(expense.date),
        stringValue(expense.shopName),
        categoryNames.get(categoryId) || "未分類",
        numberValue(expense.amount),
        stringValue(expense.memo),
        expense.source === "receipt" ? "レシート" : "手入力",
        lineItemsValue(expense.lineItems),
        memberNames.get(createdByUid) || "不明",
        stringValue(expense.updatedAt),
      ];
    }),
  ];
}

function toA1Range(startCell: string): string {
  const escapedTitle = SHEET_TITLE.replaceAll("'", "''");
  return `'${escapedTitle}'!${startCell}`;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

export function createGoogleSheetsWriter(): GoogleSheetsWriter {
  const auth = new GoogleAuth({ scopes: [SHEETS_SCOPE] });

  return {
    replaceRows: async (spreadsheetId, rows) => {
      const client = await auth.getClient();
      const encodedSpreadsheetId = encodeURIComponent(spreadsheetId);
      const spreadsheetUrl = `${SHEETS_API_BASE_URL}/${encodedSpreadsheetId}`;

      try {
        const metadataResponse = await client.request<SpreadsheetMetadata>({
          url: `${spreadsheetUrl}?fields=sheets.properties(sheetId,title)`,
          method: "GET",
        });
        let sheet = metadataResponse.data.sheets?.find((candidate) => candidate.properties?.title === SHEET_TITLE);

        if (!sheet) {
          await client.request({
            url: `${spreadsheetUrl}:batchUpdate`,
            method: "POST",
            data: { requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }] },
          });
          const refreshedMetadata = await client.request<SpreadsheetMetadata>({
            url: `${spreadsheetUrl}?fields=sheets.properties(sheetId,title)`,
            method: "GET",
          });
          sheet = refreshedMetadata.data.sheets?.find((candidate) => candidate.properties?.title === SHEET_TITLE);
        }

        const sheetId = sheet?.properties?.sheetId;
        if (typeof sheetId !== "number") {
          throw new Error("sheet-not-created");
        }

        await client.request({
          url: `${spreadsheetUrl}/values/${encodeURIComponent(toA1Range("A:J"))}:clear`,
          method: "POST",
          data: {},
        });
        await client.request({
          url: `${spreadsheetUrl}/values/${encodeURIComponent(toA1Range("A1"))}?valueInputOption=RAW`,
          method: "PUT",
          data: { majorDimension: "ROWS", values: rows },
        });
        await client.request({
          url: `${spreadsheetUrl}:batchUpdate`,
          method: "POST",
          data: {
            requests: [
              {
                updateSheetProperties: {
                  properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                  fields: "gridProperties.frozenRowCount",
                },
              },
              {
                repeatCell: {
                  range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.06, green: 0.46, blue: 0.43 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    },
                  },
                  fields: "userEnteredFormat(backgroundColor,textFormat)",
                },
              },
              {
                repeatCell: {
                  range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                  cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "¥#,##0" } } },
                  fields: "userEnteredFormat.numberFormat",
                },
              },
              {
                autoResizeDimensions: {
                  dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: SHEET_HEADERS.length },
                },
              },
            ],
          },
        });
      } catch (unknownError) {
        const status = errorStatus(unknownError);
        if (status === 403 || status === 404) {
          throw new GoogleSheetsExportError("spreadsheet_unavailable");
        }
        throw new GoogleSheetsExportError("export_failed");
      }
    },
  };
}

export async function exportActiveHouseholdExpenses(
  uid: string,
  spreadsheetId: string,
  options: {
    firestore?: Firestore;
    writer?: GoogleSheetsWriter;
    now?: Date;
  } = {},
): Promise<GoogleSheetsExportResult> {
  if (!isValidSpreadsheetId(spreadsheetId)) {
    throw new GoogleSheetsExportError("invalid_spreadsheet_id");
  }

  const firestore = options.firestore ?? getFirestore();
  const userSnapshot = await firestore.doc(`users/${uid}`).get();
  const householdId = stringValue(userSnapshot.data()?.activeHouseholdId);
  if (!householdId) {
    throw new GoogleSheetsExportError("forbidden");
  }

  const memberSnapshot = await firestore.doc(`households/${householdId}/members/${uid}`).get();
  if (!memberSnapshot.exists || memberSnapshot.data()?.role !== "owner") {
    throw new GoogleSheetsExportError("forbidden");
  }

  const [expenseSnapshots, categorySnapshots, memberSnapshots] = await Promise.all([
    firestore.collection(`households/${householdId}/expenses`).get(),
    firestore.collection(`households/${householdId}/categories`).get(),
    firestore.collection(`households/${householdId}/members`).get(),
  ]);
  const expenses = expenseSnapshots.docs.map((snapshot) => snapshot.data());
  const rows = buildExpenseSheetRows(
    expenses,
    categorySnapshots.docs.map((snapshot) => snapshot.data()),
    memberSnapshots.docs.map((snapshot) => snapshot.data()),
  );
  const writer = options.writer ?? createGoogleSheetsWriter();
  await writer.replaceRows(spreadsheetId.trim(), rows);

  const lastSyncedAt = (options.now ?? new Date()).toISOString();
  await firestore.doc(`households/${householdId}/sheetSyncSettings/default`).set({
    householdId,
    spreadsheetId: spreadsheetId.trim(),
    enabled: true,
    lastSyncedAt,
    lastExportedExpenseCount: expenses.length,
    updatedAt: lastSyncedAt,
  }, { merge: true });

  return {
    spreadsheetId: spreadsheetId.trim(),
    sheetTitle: SHEET_TITLE,
    exportedExpenses: expenses.length,
    lastSyncedAt,
  };
}
