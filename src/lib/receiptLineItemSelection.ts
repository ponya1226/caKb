import type { ReceiptLineItemCandidate } from "../types";

type LineItemCandidateEvidence = {
  declaredCountDistance: number | null;
  subtotalDifference: number | null;
  matchedSignalCount: number;
};

export type ReceiptLineItemSelectionInput = {
  textCandidates: ReceiptLineItemCandidate[];
  spatialCandidates: ReceiptLineItemCandidate[];
  declaredItemCount: number | null;
  subtotal: number | null;
};

function isDiscountCandidate(candidate: ReceiptLineItemCandidate): boolean {
  return /(割\s*引|値\s*引)/.test(candidate.name);
}

function getLineItemCandidateEvidence(
  candidates: ReceiptLineItemCandidate[],
  declaredItemCount: number | null,
  subtotal: number | null,
): LineItemCandidateEvidence {
  const productCount = candidates.filter(
    (candidate) => candidate.amount > 0 && !isDiscountCandidate(candidate),
  ).length;
  const itemTotal = candidates.reduce((sum, candidate) => sum + candidate.amount, 0);
  const declaredCountDistance = declaredItemCount === null ? null : Math.abs(productCount - declaredItemCount);
  const subtotalDifference = subtotal === null ? null : Math.abs(itemTotal - subtotal);

  return {
    declaredCountDistance,
    subtotalDifference,
    matchedSignalCount:
      Number(declaredCountDistance === 0) + Number(subtotalDifference === 0),
  };
}

function isLineItemEvidenceBetter(
  candidate: LineItemCandidateEvidence,
  current: LineItemCandidateEvidence,
): boolean {
  if (candidate.matchedSignalCount !== current.matchedSignalCount) {
    return candidate.matchedSignalCount > current.matchedSignalCount;
  }

  if (
    candidate.subtotalDifference !== null &&
    current.subtotalDifference !== null &&
    candidate.subtotalDifference !== current.subtotalDifference
  ) {
    return candidate.subtotalDifference < current.subtotalDifference;
  }

  if (
    candidate.declaredCountDistance !== null &&
    current.declaredCountDistance !== null &&
    candidate.declaredCountDistance !== current.declaredCountDistance
  ) {
    return candidate.declaredCountDistance < current.declaredCountDistance;
  }

  return false;
}

export function selectReceiptLineItemCandidates({
  textCandidates,
  spatialCandidates,
  declaredItemCount,
  subtotal,
}: ReceiptLineItemSelectionInput): ReceiptLineItemCandidate[] {
  if (spatialCandidates.length === 0) {
    return textCandidates;
  }

  const textEvidence = getLineItemCandidateEvidence(textCandidates, declaredItemCount, subtotal);
  const spatialEvidence = getLineItemCandidateEvidence(spatialCandidates, declaredItemCount, subtotal);

  return isLineItemEvidenceBetter(textEvidence, spatialEvidence) ? textCandidates : spatialCandidates;
}
