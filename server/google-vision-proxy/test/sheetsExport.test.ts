import { describe, expect, it } from "vitest";
import { buildExpenseSheetRows, isValidSpreadsheetId, SHEET_HEADERS } from "../src/sheetsExport.js";

describe("Google Sheets expense export", () => {
  it("accepts spreadsheet IDs and rejects URLs or malformed values", () => {
    expect(isValidSpreadsheetId("1AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890")).toBe(true);
    expect(isValidSpreadsheetId("https://docs.google.com/spreadsheets/d/example/edit")).toBe(false);
    expect(isValidSpreadsheetId("short-id")).toBe(false);
  });

  it("exports one expense per row with category, line items, and creator labels", () => {
    const rows = buildExpenseSheetRows(
      [
        {
          id: "expense-1",
          date: "2026-07-03",
          shopName: "サンプルストア",
          categoryId: "food",
          amount: 6154,
          memo: "週末の買い物",
          source: "receipt",
          lineItems: [
            { name: "商品A", amount: 159 },
            { name: "商品B", amount: 299 },
          ],
          createdByUid: "member-1",
          updatedAt: "2026-07-03T06:00:00.000Z",
        },
      ],
      [{ id: "food", name: "食費" }],
      [{ uid: "member-1", displayName: "家族A" }],
    );

    expect(rows[0]).toEqual([...SHEET_HEADERS]);
    expect(rows[1]).toEqual([
      "expense-1",
      "2026-07-03",
      "サンプルストア",
      "食費",
      6154,
      "週末の買い物",
      "レシート",
      "商品A (159円) / 商品B (299円)",
      "家族A",
      "2026-07-03T06:00:00.000Z",
    ]);
  });

  it("sorts latest expenses first and safely labels missing references", () => {
    const rows = buildExpenseSheetRows(
      [
        { id: "older", date: "2026-06-01", amount: 100, source: "manual" },
        { id: "newer", date: "2026-07-01", amount: 200, source: "manual" },
      ],
      [],
      [],
    );

    expect(rows[1]?.[0]).toBe("newer");
    expect(rows[1]?.[3]).toBe("未分類");
    expect(rows[1]?.[8]).toBe("不明");
  });
});
