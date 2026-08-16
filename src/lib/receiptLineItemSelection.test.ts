import { describe, expect, it } from "vitest";
import type { ReceiptLineItemCandidate } from "../types";
import { selectReceiptLineItemCandidates } from "./receiptLineItemSelection";

function candidate(name: string, amount: number): ReceiptLineItemCandidate {
  return { name, amount, line: `${name} ¥${amount}`, confidence: 0.8 };
}

describe("selectReceiptLineItemCandidates", () => {
  it("prefers the candidate set that matches both declared count and subtotal", () => {
    const textCandidates = [candidate("商品A", 100), candidate("商品B", 200)];
    const spatialCandidates = [candidate("商品A", 100), candidate("商品B", 250)];

    expect(selectReceiptLineItemCandidates({
      textCandidates,
      spatialCandidates,
      declaredItemCount: 2,
      subtotal: 300,
    })).toBe(textCandidates);
  });

  it("keeps spatial candidates when evidence is tied", () => {
    const textCandidates = [candidate("商品A", 100)];
    const spatialCandidates = [candidate("商品A", 100)];

    expect(selectReceiptLineItemCandidates({
      textCandidates,
      spatialCandidates,
      declaredItemCount: null,
      subtotal: null,
    })).toBe(spatialCandidates);
  });
});
