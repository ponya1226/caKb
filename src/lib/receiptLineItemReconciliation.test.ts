import { describe, expect, it } from "vitest";
import type { ReceiptLineItemCandidate } from "../types";
import type { PendingReceiptLineItemName } from "./receiptLineItemAssociation";
import type { ReceiptLineItemProfile } from "./receiptLineItemProfiles";
import {
  reconcileReceiptLineItems,
  type ReceiptLineItemReconciliationEvidence,
} from "./receiptLineItemReconciliation";

const profile: ReceiptLineItemProfile = {
  id: "generic",
  itemCodePattern: /^\d{2}\s+\S/,
  requiresItemCodeToStart: false,
  maxPendingNames: 10,
  columnReconciliationMinItems: 2,
  columnReconciliationMaxItems: 10,
};

function candidate(
  name: string,
  amount: number,
  extractionMethod: ReceiptLineItemCandidate["extractionMethod"] = "same_line",
): ReceiptLineItemCandidate {
  return {
    name,
    amount,
    line: `${name} ${amount}`,
    confidence: 0.9,
    extractionMethod,
  };
}

function unmatched(name: string): PendingReceiptLineItemName {
  return {
    name,
    line: `01 ${name}`,
    hasItemCode: true,
    isDiscount: false,
  };
}

function evidence(
  overrides: Partial<ReceiptLineItemReconciliationEvidence> = {},
): ReceiptLineItemReconciliationEvidence {
  return {
    declaredItemCount: 3,
    subtotal: 600,
    columnOrderedAmounts: [],
    ...overrides,
  };
}

describe("receipt line item reconciliation", () => {
  it("pairs ordered trailing amounts only when the declared count and subtotal agree", () => {
    const result = reconcileReceiptLineItems({
      candidates: [candidate("Item A", 100)],
      unmatchedNames: [unmatched("Item B"), unmatched("Item C")],
      profile,
      evidence: evidence({
        columnOrderedAmounts: [
          { amount: 200, line: "200", confidence: 0.7 },
          { amount: 300, line: "300", confidence: 0.72 },
          { amount: 600, line: "600", confidence: 0.8 },
        ],
      }),
    });

    expect(result.map((item) => [item.name, item.amount])).toEqual([
      ["Item A", 100],
      ["Item B", 200],
      ["Item C", 300],
    ]);
    expect(result.slice(1).map((item) => item.extractionMethod)).toEqual([
      "ambiguous_pair",
      "ambiguous_pair",
    ]);
  });

  it("includes discounts in the subtotal invariant but not in the declared product count", () => {
    const result = reconcileReceiptLineItems({
      candidates: [candidate("Item A", 100), candidate("Discount", -20, "discount_pair")],
      unmatchedNames: [unmatched("Item B"), unmatched("Item C")],
      profile,
      evidence: evidence({
        subtotal: 580,
        columnOrderedAmounts: [
          { amount: 200, line: "200", confidence: 0.7 },
          { amount: 300, line: "300", confidence: 0.7 },
          { amount: 580, line: "580", confidence: 0.8 },
        ],
      }),
    });

    expect(result).toHaveLength(4);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(580);
  });

  it.each([
    { declaredItemCount: 4, subtotal: 600, subtotalAmount: 600 },
    { declaredItemCount: 3, subtotal: 600, subtotalAmount: 599 },
    { declaredItemCount: 3, subtotal: 601, subtotalAmount: 600 },
  ])("does not pair ordered amounts when evidence conflicts: %o", ({
    declaredItemCount,
    subtotal,
    subtotalAmount,
  }) => {
    const original = [candidate("Item A", 100)];
    const result = reconcileReceiptLineItems({
      candidates: original,
      unmatchedNames: [unmatched("Item B"), unmatched("Item C")],
      profile,
      evidence: evidence({
        declaredItemCount,
        subtotal,
        columnOrderedAmounts: [
          { amount: 200, line: "200", confidence: 0.7 },
          { amount: 300, line: "300", confidence: 0.7 },
          { amount: subtotalAmount, line: String(subtotalAmount), confidence: 0.8 },
        ],
      }),
    });

    expect(result).toEqual(original);
  });

  it("does not append a residual after a successful column reconciliation", () => {
    const result = reconcileReceiptLineItems({
      candidates: [candidate("Item A", 100)],
      unmatchedNames: [unmatched("Item B")],
      profile: {
        ...profile,
        columnReconciliationMinItems: 1,
      },
      evidence: evidence({
        declaredItemCount: 2,
        columnOrderedAmounts: [
          { amount: 500, line: "500", confidence: 0.7 },
          { amount: 600, line: "600", confidence: 0.8 },
        ],
      }),
    });

    expect(result.map((item) => [item.name, item.amount])).toEqual([
      ["Item A", 100],
      ["Item B", 500],
    ]);
  });

  it("fills one unmatched product from an integer subtotal residual", () => {
    const result = reconcileReceiptLineItems({
      candidates: [candidate("Item A", 100)],
      unmatchedNames: [unmatched("Item B")],
      profile,
      evidence: evidence({ declaredItemCount: 2, subtotal: 600 }),
    });

    expect(result[result.length - 1]).toMatchObject({
      name: "Item B",
      amount: 500,
      confidence: 0.52,
      extractionMethod: "subtotal_residual",
    });
  });

  it.each([5, 1_000_101])("rejects unsafe subtotal residuals: %s", (subtotal) => {
    const original = [candidate("Item A", 0)];
    const result = reconcileReceiptLineItems({
      candidates: original,
      unmatchedNames: [unmatched("Item B")],
      profile,
      evidence: evidence({ declaredItemCount: 2, subtotal }),
    });

    expect(result).toEqual(original);
  });

  it("does not infer a subtotal residual for multiple unmatched products", () => {
    const original = [candidate("Item A", 100)];
    const result = reconcileReceiptLineItems({
      candidates: original,
      unmatchedNames: [unmatched("Item B"), unmatched("Item C")],
      profile,
      evidence: evidence({ declaredItemCount: 3, subtotal: 600 }),
    });

    expect(result).toEqual(original);
  });
});
