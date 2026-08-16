import { describe, expect, it } from "vitest";
import {
  evaluateReceiptQualityCorpus,
  formatReceiptQualityCorpusReport,
} from "./receiptQualityEvaluation";
import { RECEIPT_QUALITY_FIXTURES } from "./receiptQualityFixtures";

describe("receipt quality corpus", () => {
  it("keeps supported anonymous fixtures exact and never routes an unsafe fixture to auto save", () => {
    const report = evaluateReceiptQualityCorpus(RECEIPT_QUALITY_FIXTURES);
    const decisionMismatches = report.fixtures.filter(
      (fixture) => fixture.expectedDecision !== fixture.actualDecision,
    );
    const excludedAmountLeaks = report.fixtures
      .filter((fixture) => fixture.excludedAmountLeaks.length > 0)
      .map(({ id, excludedAmountLeaks: amounts }) => ({ id, amounts }));

    expect(decisionMismatches).toEqual([]);
    expect(excludedAmountLeaks).toEqual([]);
    expect(report.overall).toMatchObject({
      receiptCount: 15,
      totalAccuracy: 1,
      exactLineItemRate: 1,
      lineItemPrecision: 1,
      lineItemRecall: 1,
      excludedAmountLeakCount: 0,
      falseAutoSaveCount: 0,
      unexpectedReviewCount: 0,
    });
    expect(report.layouts.map((layout) => layout.layoutFamily)).toEqual([
      "convenience",
      "supermarket",
      "specialty",
      "grocery",
      "home-center",
      "partial",
    ]);
    expect(report.structures.map((structure) => structure.structureFeature)).toEqual([
      "item-same-line",
      "item-split-line",
      "subtotal-tax",
      "split-payable-total",
      "payment",
      "change",
      "stored-value-balance",
      "numeric-footer",
      "column-reordered",
      "partial-ocr",
    ]);
    expect(report.structures.every((structure) => structure.excludedAmountLeakCount === 0)).toBe(true);
    expect(report.fixtures.filter((fixture) => fixture.falseAutoSave)).toEqual([]);
  });

  it("formats the quality gate without receipt content", () => {
    const report = formatReceiptQualityCorpusReport(evaluateReceiptQualityCorpus(RECEIPT_QUALITY_FIXTURES));

    expect(report).toBe([
      "レシート数: 15",
      "構造特徴: 10種",
      "総額一致率: 100.0%",
      "品目完全一致率: 100.0%",
      "品目適合率: 100.0%",
      "品目再現率: 100.0%",
      "決済後数値混入: 0",
      "誤High: 0",
      "不要な要確認: 0",
    ].join("\n"));
    expect(report).not.toMatch(/商品A|店舗|金額|ocrText|image/);
  });
});
