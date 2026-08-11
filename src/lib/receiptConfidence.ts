import type {
  ReceiptCategorySuggestion,
  ReceiptConfidenceAssessment,
  ReceiptConfidenceReason,
  ReceiptLineItemConsistency,
  ReceiptParseResult,
} from "../types";
import { normalizeShopNameForCategory } from "./categorySuggestion";

const MIN_TOTAL_CONFIDENCE = 0.9;
const MIN_MERCHANT_CONFIDENCE = 0.75;
const MAX_AUTOMATIC_TOTAL = 1_000_000;
const MAX_RECEIPT_AGE_YEARS = 10;
const MAX_FUTURE_DAYS = 1;

export const RECEIPT_CONFIDENCE_POLICY_VERSION = "receipt-confidence-v1";

type ReceiptConfidenceInput = {
  ocrText: string;
  parseResult: ReceiptParseResult;
  categorySuggestion?: ReceiptCategorySuggestion;
  now?: Date;
};

function parseDateAtUtc(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

function isDateInAutomaticRange(value: string, now: Date): boolean {
  const date = parseDateAtUtc(value);
  if (!date) {
    return false;
  }

  const latestDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + MAX_FUTURE_DAYS));
  const earliestDate = new Date(Date.UTC(now.getUTCFullYear() - MAX_RECEIPT_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
  return date >= earliestDate && date <= latestDate;
}

function hasConflictingAmounts(result: ReceiptParseResult): boolean {
  const primaryAmount = result.amountCandidates[0];
  if (!primaryAmount) {
    return false;
  }

  return result.amountCandidates.slice(1).some((candidate) => (
    candidate.value !== primaryAmount.value && candidate.confidence >= MIN_TOTAL_CONFIDENCE
  ));
}

function hasConflictingMerchants(result: ReceiptParseResult): boolean {
  const primaryMerchant = result.shopNameCandidates[0];
  const nextMerchant = result.shopNameCandidates[1];
  if (!primaryMerchant || !nextMerchant || nextMerchant.confidence < primaryMerchant.confidence - 0.03) {
    return false;
  }

  return normalizeShopNameForCategory(primaryMerchant.value) !== normalizeShopNameForCategory(nextMerchant.value);
}

function getLineItemConsistency(result: ReceiptParseResult): ReceiptLineItemConsistency {
  const total = result.amountCandidates[0]?.value;
  if (!total || result.lineItemCandidates.length === 0) {
    return "unknown";
  }

  const lineItemTotal = result.lineItemCandidates.reduce((sum, item) => sum + item.amount, 0);
  const allowedDifference = Math.max(100, Math.round(total * 0.15));
  return Math.abs(lineItemTotal - total) <= allowedDifference ? "consistent" : "inconsistent";
}

function addReason(
  reasons: ReceiptConfidenceReason[],
  reason: ReceiptConfidenceReason,
): void {
  if (!reasons.some((current) => current.code === reason.code)) {
    reasons.push(reason);
  }
}

export function assessReceiptConfidence({
  ocrText,
  parseResult,
  categorySuggestion,
  now = new Date(),
}: ReceiptConfidenceInput): ReceiptConfidenceAssessment {
  const reasons: ReceiptConfidenceReason[] = [];
  const primaryAmount = parseResult.amountCandidates[0];
  const primaryDate = parseResult.dateCandidates[0];
  const primaryMerchant = parseResult.shopNameCandidates[0];
  const ocrSucceeded = ocrText.trim().length >= 10;
  const conflictingAmounts = hasConflictingAmounts(parseResult);
  const conflictingMerchants = hasConflictingMerchants(parseResult);
  const suspiciousBalanceCandidate = Boolean(
    primaryAmount && parseResult.riskSignals.balanceAmounts.some((amount) => amount !== primaryAmount.value),
  );
  const amountIsRealistic = Boolean(
    primaryAmount && Number.isInteger(primaryAmount.value) && primaryAmount.value > 0 && primaryAmount.value <= MAX_AUTOMATIC_TOTAL,
  );
  const totalResolved = Boolean(
    primaryAmount &&
      primaryAmount.confidence >= MIN_TOTAL_CONFIDENCE &&
      amountIsRealistic &&
      !conflictingAmounts &&
      !suspiciousBalanceCandidate,
  );
  const dateInRange = Boolean(primaryDate && isDateInAutomaticRange(primaryDate.value, now));
  const dateResolved = Boolean(primaryDate && primaryDate.confidence >= 0.9 && dateInRange);
  const merchantResolved = Boolean(
    primaryMerchant &&
      primaryMerchant.confidence >= MIN_MERCHANT_CONFIDENCE &&
      normalizeShopNameForCategory(primaryMerchant.value).length >= 2 &&
      !conflictingMerchants,
  );
  const categoryResolved = Boolean(categorySuggestion?.categoryId && categorySuggestion.source);
  const lineItemConsistency = getLineItemConsistency(parseResult);

  if (!ocrSucceeded) {
    addReason(reasons, { code: "ocr_failed", message: "読み取れた文字が不足しています", severity: "blocking" });
  }
  if (!primaryAmount) {
    addReason(reasons, { code: "total_missing", message: "支払総額を特定できませんでした", severity: "blocking" });
  } else {
    if (!amountIsRealistic) {
      addReason(reasons, { code: "total_unrealistic", message: "支払総額が通常の範囲外です", severity: "blocking" });
    } else if (primaryAmount.confidence < MIN_TOTAL_CONFIDENCE) {
      addReason(reasons, { code: "total_uncertain", message: "支払総額の候補を確認してください", severity: "blocking" });
    }
    if (conflictingAmounts) {
      addReason(reasons, { code: "total_conflict", message: "支払総額になり得る金額が複数あります", severity: "blocking" });
    }
    if (suspiciousBalanceCandidate) {
      addReason(reasons, { code: "balance_detected", message: "残高と支払総額を取り違えていないか確認してください", severity: "blocking" });
    }
  }
  if (!primaryDate) {
    addReason(reasons, { code: "date_missing", message: "利用日を特定できませんでした", severity: "blocking" });
  } else if (!dateInRange) {
    addReason(reasons, { code: "date_out_of_range", message: "利用日が正しいか確認してください", severity: "blocking" });
  }
  if (!primaryMerchant) {
    addReason(reasons, { code: "merchant_missing", message: "店舗名を特定できませんでした", severity: "blocking" });
  } else if (primaryMerchant.confidence < MIN_MERCHANT_CONFIDENCE) {
    addReason(reasons, { code: "merchant_uncertain", message: "店舗名の候補を確認してください", severity: "blocking" });
  } else if (conflictingMerchants) {
    addReason(reasons, { code: "merchant_conflict", message: "店舗名になり得る候補が複数あります", severity: "blocking" });
  }
  if (!categoryResolved) {
    addReason(reasons, { code: "category_unresolved", message: "この店舗のカテゴリを選んでください", severity: "blocking" });
  }
  if (lineItemConsistency === "inconsistent") {
    addReason(reasons, {
      code: "line_items_inconsistent",
      message: "品目合計と支払総額に差があります",
      severity: "warning",
    });
  }

  const signals = {
    ocrSucceeded,
    totalResolved,
    dateResolved,
    merchantResolved,
    categoryResolved,
    conflictingAmounts,
    conflictingMerchants,
    suspiciousBalanceCandidate,
    lineItemConsistency,
  };
  const canAutoSave = ocrSucceeded && totalResolved && dateResolved && merchantResolved && categoryResolved;

  return {
    policyVersion: RECEIPT_CONFIDENCE_POLICY_VERSION,
    decision: canAutoSave ? "autoSave" : "needsReview",
    signals,
    reasons,
  };
}
