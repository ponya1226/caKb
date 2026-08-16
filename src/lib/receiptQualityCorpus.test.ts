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

    expect(decisionMismatches).toEqual([]);
    expect(report.overall).toMatchObject({
      receiptCount: 13,
      totalAccuracy: 1,
      exactLineItemRate: 1,
      lineItemPrecision: 1,
      lineItemRecall: 1,
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
    expect(report.fixtures.filter((fixture) => fixture.falseAutoSave)).toEqual([]);
  });

  it("formats the quality gate without receipt content", () => {
    const report = formatReceiptQualityCorpusReport(evaluateReceiptQualityCorpus(RECEIPT_QUALITY_FIXTURES));

    expect(report).toBe([
      "レシート数: 13",
      "総額一致率: 100.0%",
      "品目完全一致率: 100.0%",
      "品目適合率: 100.0%",
      "品目再現率: 100.0%",
      "誤High: 0",
      "不要な要確認: 0",
    ].join("\n"));
    expect(report).not.toMatch(/商品A|店舗|金額|ocrText|image/);
  });
});
