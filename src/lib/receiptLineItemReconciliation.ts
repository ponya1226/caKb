import type { ReceiptLineItemCandidate } from "../types";
import type { PendingReceiptLineItemName } from "./receiptLineItemAssociation";
import { isReceiptLineItemDiscount } from "./receiptLineItemClassification";
import type { ReceiptLineItemProfile } from "./receiptLineItemProfiles";

export type ReceiptLineItemReconciliationAmount = {
  amount: number;
  line: string;
  confidence: number;
};

export type ReceiptLineItemReconciliationEvidence = {
  declaredItemCount: number | null;
  subtotal: number | null;
  columnOrderedAmounts: ReceiptLineItemReconciliationAmount[];
};

type ReceiptLineItemReconciliationInput = {
  candidates: ReceiptLineItemCandidate[];
  unmatchedNames: PendingReceiptLineItemName[];
  profile: ReceiptLineItemProfile;
  evidence: ReceiptLineItemReconciliationEvidence;
};

function getUnmatchedProducts(
  unmatchedNames: PendingReceiptLineItemName[],
): PendingReceiptLineItemName[] {
  return unmatchedNames.filter((item) => item.hasItemCode && !item.isDiscount);
}

function reconcileColumnOrderedLineItems({
  candidates,
  unmatchedNames,
  profile,
  evidence,
}: ReceiptLineItemReconciliationInput): ReceiptLineItemCandidate[] {
  const unmatchedProducts = getUnmatchedProducts(unmatchedNames);
  if (
    unmatchedProducts.length < profile.columnReconciliationMinItems ||
    unmatchedProducts.length > profile.columnReconciliationMaxItems
  ) {
    return candidates;
  }

  const extractedProductCount = candidates.filter(
    (candidate) => candidate.amount > 0 && !isReceiptLineItemDiscount(candidate.name),
  ).length;
  if (evidence.declaredItemCount !== extractedProductCount + unmatchedProducts.length) {
    return candidates;
  }

  const currentTotal = candidates.reduce((sum, candidate) => sum + candidate.amount, 0);
  const { columnOrderedAmounts } = evidence;
  for (
    let start = 0;
    start + unmatchedProducts.length < columnOrderedAmounts.length;
    start += 1
  ) {
    const itemAmounts = columnOrderedAmounts.slice(start, start + unmatchedProducts.length);
    const subtotalAmount = columnOrderedAmounts[start + unmatchedProducts.length]?.amount;
    const inferredSubtotal = currentTotal + itemAmounts.reduce((sum, item) => sum + item.amount, 0);
    if (
      subtotalAmount !== inferredSubtotal ||
      (evidence.subtotal !== null && subtotalAmount !== evidence.subtotal)
    ) {
      continue;
    }

    return [
      ...candidates,
      ...unmatchedProducts.map((item, index): ReceiptLineItemCandidate => ({
        name: item.name,
        amount: itemAmounts[index].amount,
        line: `${item.line} / ${itemAmounts[index].line} / 小計一致`,
        confidence: itemAmounts[index].confidence,
        extractionMethod: "ambiguous_pair",
      })),
    ];
  }

  return candidates;
}

function reconcileSubtotalResidualLineItem({
  candidates,
  unmatchedNames,
  evidence,
}: ReceiptLineItemReconciliationInput): ReceiptLineItemCandidate[] {
  const unmatchedProducts = getUnmatchedProducts(unmatchedNames);
  if (!evidence.subtotal || unmatchedProducts.length !== 1) {
    return candidates;
  }

  const currentTotal = candidates.reduce((sum, candidate) => sum + candidate.amount, 0);
  const residual = evidence.subtotal - currentTotal;
  if (!Number.isInteger(residual) || residual < 10 || residual > 1_000_000) {
    return candidates;
  }

  return [
    ...candidates,
    {
      name: unmatchedProducts[0].name,
      amount: residual,
      line: `${unmatchedProducts[0].line} / 小計差分`,
      confidence: 0.52,
      extractionMethod: "subtotal_residual",
    },
  ];
}

export function reconcileReceiptLineItems(
  input: ReceiptLineItemReconciliationInput,
): ReceiptLineItemCandidate[] {
  const columnReconciledCandidates = reconcileColumnOrderedLineItems(input);
  if (columnReconciledCandidates !== input.candidates) {
    return columnReconciledCandidates;
  }

  return reconcileSubtotalResidualLineItem({
    ...input,
    candidates: columnReconciledCandidates,
  });
}
