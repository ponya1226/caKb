import { describe, expect, it } from "vitest";
import type { ReceiptCategorySuggestion } from "../types";
import { assessReceiptConfidence } from "./receiptConfidence";
import { parseReceiptText } from "./receiptParser";

const NOW = new Date("2026-08-09T00:00:00.000Z");
const CATEGORY_SUGGESTION: ReceiptCategorySuggestion = {
  categoryId: "food",
  matchedShopName: "サンプル店舗",
  source: "rule",
  ruleId: "rule-1",
};

function assess(text: string, categorySuggestion: ReceiptCategorySuggestion | null = CATEGORY_SUGGESTION) {
  return assessReceiptConfidence({
    ocrText: text,
    parseResult: parseReceiptText(text),
    categorySuggestion: categorySuggestion ?? undefined,
    now: NOW,
  });
}

describe("assessReceiptConfidence", () => {
  it("allows a normal supermarket receipt to be saved automatically", () => {
    const result = assess(`
      SAMPLE MARKET
      サンプル団地店
      2026/08/05 14:12
      ベーキングパウダー ¥158
      小計 ¥158
      外税8% ¥12
      合計 ¥170
      現金 ¥1,020
      お釣り ¥850
    `);

    expect(result.decision).toBe("autoSave");
    expect(result.signals).toMatchObject({
      totalResolved: true,
      dateResolved: true,
      merchantResolved: true,
      categoryResolved: true,
    });
  });

  it("allows a convenience-store receipt with a learned category to be saved automatically", () => {
    const result = assess(`
      SAMPLE CONVENIENCE
      サンプルコンビニ
      架空1丁目店
      2026年08月08日 20:31
      商品A ¥168
      商品B ¥278
      小計 ¥446
      消費税等 ¥35
      合計 ¥481
      電子決済支払 ¥481
    `);

    expect(result.decision).toBe("autoSave");
  });

  it("allows a specialty-store receipt with a learned category to be saved automatically", () => {
    const result = assess(`
      SAMPLE TEA
      2026年08月05日 16:37
      DECAF SAMPLE TB10 ¥1,000
      合計 ¥1,000
      お預り ¥1,000
      おつり ¥0
    `);

    expect(result.decision).toBe("autoSave");
  });

  it("requires review when an electronic-money balance differs from the total", () => {
    const result = assess(`
      SAMPLE STORE
      2026年08月08日 16:25
      商品A ¥348
      合計 ¥348
      交通系マネー ¥348
      支払後残高 ¥1,494
    `);

    expect(result.decision).toBe("needsReview");
    expect(result.signals.suspiciousBalanceCandidate).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).toContain("balance_detected");
  });

  it("requires review when strong total candidates conflict", () => {
    const result = assess(`
      SAMPLE STORE
      2026年08月08日
      合計 ¥500
      お支払 ¥650
    `);

    expect(result.decision).toBe("needsReview");
    expect(result.signals.conflictingAmounts).toBe(true);
    expect(result.reasons.map((reason) => reason.code)).toContain("total_conflict");
  });

  it("requires review when the date is missing", () => {
    const result = assess("SAMPLE STORE\n商品A ¥500\n合計 ¥500");

    expect(result.decision).toBe("needsReview");
    expect(result.signals.dateResolved).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("date_missing");
  });

  it("requires review when the merchant is missing", () => {
    const result = assess("2026年08月08日\n合計 ¥500");

    expect(result.decision).toBe("needsReview");
    expect(result.signals.merchantResolved).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("merchant_missing");
  });

  it("requires review for a partial OCR result and an unresolved category", () => {
    const result = assess("合計", null);

    expect(result.decision).toBe("needsReview");
    expect(result.signals.ocrSucceeded).toBe(false);
    expect(result.signals.categoryResolved).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["ocr_failed", "category_unresolved"]),
    );
  });

  it("does not block automatic save only because optional line items are inconsistent", () => {
    const result = assess(`
      SAMPLE STORE
      2026年08月08日
      商品A ¥100
      合計 ¥1,000
    `);

    expect(result.signals.lineItemConsistency).toBe("inconsistent");
    expect(result.decision).toBe("autoSave");
    expect(result.reasons).toContainEqual(expect.objectContaining({
      code: "line_items_inconsistent",
      severity: "warning",
    }));
  });
});
