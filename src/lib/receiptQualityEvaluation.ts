import type { ReceiptCategorySuggestion, ReceiptConfidenceReasonCode } from "../types";
import { assessReceiptConfidence } from "./receiptConfidence";
import { parseReceiptText } from "./receiptParser";
import type { ReceiptQualityFixture, ReceiptQualityFixtureLineItem } from "./receiptQualityFixtures";

export type ReceiptQualityFixtureEvaluation = {
  id: string;
  layoutFamily: ReceiptQualityFixture["layoutFamily"];
  totalMatched: boolean;
  lineItemsExact: boolean;
  expectedLineItemCount: number;
  actualLineItemCount: number;
  matchedLineItemCount: number;
  expectedDecision: ReceiptQualityFixture["expectedDecision"];
  actualDecision: ReceiptQualityFixture["expectedDecision"];
  reasonCodes: ReceiptConfidenceReasonCode[];
  falseAutoSave: boolean;
  unexpectedReview: boolean;
};

export type ReceiptQualityAggregate = {
  receiptCount: number;
  totalMatchedReceipts: number;
  totalAccuracy: number;
  exactLineItemReceipts: number;
  exactLineItemRate: number;
  expectedLineItemCount: number;
  actualLineItemCount: number;
  matchedLineItemCount: number;
  lineItemPrecision: number;
  lineItemRecall: number;
  falseAutoSaveCount: number;
  unexpectedReviewCount: number;
};

export type ReceiptQualityCorpusReport = {
  overall: ReceiptQualityAggregate;
  layouts: Array<ReceiptQualityAggregate & { layoutFamily: ReceiptQualityFixture["layoutFamily"] }>;
  fixtures: ReceiptQualityFixtureEvaluation[];
};

const FIXTURE_CATEGORY: ReceiptCategorySuggestion = {
  categoryId: "fixture-category",
  matchedShopName: "匿名店舗",
  source: "rule",
  ruleId: "receipt-quality-corpus",
};

function lineItemKey([name, amount]: ReceiptQualityFixtureLineItem): string {
  return `${name}\u0000${amount}`;
}

function countMatchedLineItems(
  expected: readonly ReceiptQualityFixtureLineItem[],
  actual: readonly ReceiptQualityFixtureLineItem[],
): number {
  const remainingExpected = expected.map(lineItemKey);
  return actual.reduce((matchedCount, lineItem) => {
    const matchIndex = remainingExpected.indexOf(lineItemKey(lineItem));
    if (matchIndex < 0) {
      return matchedCount;
    }

    remainingExpected.splice(matchIndex, 1);
    return matchedCount + 1;
  }, 0);
}

function lineItemsMatchExactly(
  expected: readonly ReceiptQualityFixtureLineItem[],
  actual: readonly ReceiptQualityFixtureLineItem[],
): boolean {
  return expected.length === actual.length && expected.every(
    (lineItem, index) => lineItemKey(lineItem) === lineItemKey(actual[index]),
  );
}

function divideOrPerfect(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function aggregateEvaluations(evaluations: readonly ReceiptQualityFixtureEvaluation[]): ReceiptQualityAggregate {
  const receiptCount = evaluations.length;
  const totalMatchedReceipts = evaluations.filter((evaluation) => evaluation.totalMatched).length;
  const exactLineItemReceipts = evaluations.filter((evaluation) => evaluation.lineItemsExact).length;
  const expectedLineItemCount = evaluations.reduce((sum, evaluation) => sum + evaluation.expectedLineItemCount, 0);
  const actualLineItemCount = evaluations.reduce((sum, evaluation) => sum + evaluation.actualLineItemCount, 0);
  const matchedLineItemCount = evaluations.reduce((sum, evaluation) => sum + evaluation.matchedLineItemCount, 0);

  return {
    receiptCount,
    totalMatchedReceipts,
    totalAccuracy: divideOrPerfect(totalMatchedReceipts, receiptCount),
    exactLineItemReceipts,
    exactLineItemRate: divideOrPerfect(exactLineItemReceipts, receiptCount),
    expectedLineItemCount,
    actualLineItemCount,
    matchedLineItemCount,
    lineItemPrecision: divideOrPerfect(matchedLineItemCount, actualLineItemCount),
    lineItemRecall: divideOrPerfect(matchedLineItemCount, expectedLineItemCount),
    falseAutoSaveCount: evaluations.filter((evaluation) => evaluation.falseAutoSave).length,
    unexpectedReviewCount: evaluations.filter((evaluation) => evaluation.unexpectedReview).length,
  };
}

export function evaluateReceiptQualityCorpus(
  fixtures: readonly ReceiptQualityFixture[],
  now = new Date("2026-08-16T00:00:00.000Z"),
): ReceiptQualityCorpusReport {
  const fixtureEvaluations = fixtures.map((fixture): ReceiptQualityFixtureEvaluation => {
    const parseResult = parseReceiptText(fixture.ocrText, fixture.ocrBlocks);
    const assessment = assessReceiptConfidence({
      ocrText: fixture.ocrText,
      parseResult,
      categorySuggestion: FIXTURE_CATEGORY,
      now,
    });
    const actualLineItems = parseResult.lineItemCandidates.map(
      (candidate) => [candidate.name, candidate.amount] as const,
    );

    return {
      id: fixture.id,
      layoutFamily: fixture.layoutFamily,
      totalMatched: (parseResult.amountCandidates[0]?.value ?? null) === fixture.expectedTotal,
      lineItemsExact: lineItemsMatchExactly(fixture.expectedLineItems, actualLineItems),
      expectedLineItemCount: fixture.expectedLineItems.length,
      actualLineItemCount: actualLineItems.length,
      matchedLineItemCount: countMatchedLineItems(fixture.expectedLineItems, actualLineItems),
      expectedDecision: fixture.expectedDecision,
      actualDecision: assessment.decision,
      reasonCodes: assessment.reasons.map((reason) => reason.code),
      falseAutoSave: fixture.expectedDecision === "needsReview" && assessment.decision === "autoSave",
      unexpectedReview: fixture.expectedDecision === "autoSave" && assessment.decision === "needsReview",
    };
  });
  const layoutFamilies = [...new Set(fixtures.map((fixture) => fixture.layoutFamily))];

  return {
    overall: aggregateEvaluations(fixtureEvaluations),
    layouts: layoutFamilies.map((layoutFamily) => ({
      layoutFamily,
      ...aggregateEvaluations(fixtureEvaluations.filter((fixture) => fixture.layoutFamily === layoutFamily)),
    })),
    fixtures: fixtureEvaluations,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatReceiptQualityCorpusReport(report: ReceiptQualityCorpusReport): string {
  const { overall } = report;
  return [
    `レシート数: ${overall.receiptCount}`,
    `総額一致率: ${formatPercent(overall.totalAccuracy)}`,
    `品目完全一致率: ${formatPercent(overall.exactLineItemRate)}`,
    `品目適合率: ${formatPercent(overall.lineItemPrecision)}`,
    `品目再現率: ${formatPercent(overall.lineItemRecall)}`,
    `誤High: ${overall.falseAutoSaveCount}`,
    `不要な要確認: ${overall.unexpectedReviewCount}`,
  ].join("\n");
}
