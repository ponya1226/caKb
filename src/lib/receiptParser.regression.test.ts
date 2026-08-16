import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./receiptParser";
import { RECEIPT_QUALITY_FIXTURES } from "./receiptQualityFixtures";

describe("receiptParser anonymized receipt regressions", () => {
  it.each(RECEIPT_QUALITY_FIXTURES)("$name", (fixture) => {
    const result = parseReceiptText(fixture.ocrText, fixture.ocrBlocks);

    expect(result.amountCandidates[0]?.value ?? null).toBe(fixture.expectedTotal);
    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual(
      fixture.expectedLineItems,
    );
  });
});
