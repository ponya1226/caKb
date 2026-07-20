import { describe, expect, it, vi } from "vitest";
import {
  deriveGoogleSheetsProxyUrl,
  exportExpensesToGoogleSheets,
  extractSpreadsheetId,
} from "./googleSheetsSync";

const spreadsheetId = "1AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890";

describe("Google Sheets sync client", () => {
  it("extracts a spreadsheet ID from an ID or Google Sheets URL", () => {
    expect(extractSpreadsheetId(spreadsheetId)).toBe(spreadsheetId);
    expect(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`)).toBe(spreadsheetId);
    expect(extractSpreadsheetId("https://example.com/not-a-sheet")).toBeNull();
  });

  it("derives the Sheets endpoint from the configured OCR endpoint", () => {
    expect(deriveGoogleSheetsProxyUrl("https://proxy.example/api/ocr"))
      .toBe("https://proxy.example/api/sheets/export");
    expect(deriveGoogleSheetsProxyUrl(null)).toBeNull();
  });

  it("posts the normalized spreadsheet ID with a Firebase ID token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      spreadsheetId,
      sheetTitle: "caKb支出",
      exportedExpenses: 3,
      lastSyncedAt: "2026-07-20T00:00:00.000Z",
    }));

    await expect(exportExpensesToGoogleSheets(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      { proxyUrl: "https://proxy.example/api/sheets/export", authToken: "id-token", fetcher },
    )).resolves.toMatchObject({ spreadsheetId, exportedExpenses: 3 });

    expect(fetcher).toHaveBeenCalledWith(
      "https://proxy.example/api/sheets/export",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer id-token" }),
        body: JSON.stringify({ spreadsheetId }),
      }),
    );
  });

  it("returns safe guidance when the spreadsheet is not shared", async () => {
    await expect(exportExpensesToGoogleSheets(spreadsheetId, {
      proxyUrl: "https://proxy.example/api/sheets/export",
      authToken: "id-token",
      fetcher: async () => Response.json({ code: "spreadsheet_unavailable" }, { status: 502 }),
    })).rejects.toThrow("サービスアカウントへの編集権限");
  });
});
