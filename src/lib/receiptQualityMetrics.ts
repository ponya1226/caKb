import type { ReceiptConfidenceReasonCode } from "../types";
import { currentMonthKey } from "./date";

export const RECEIPT_QUALITY_METRICS_STORAGE_KEY = "cakb-receipt-quality-metrics-v1";
export const RECEIPT_QUALITY_METRICS_RETENTION_MONTHS = 12;

export type ReceiptQualityReviewReasonCode = ReceiptConfidenceReasonCode | "batch_flow" | "unknown";

export type ReceiptQualityEvent =
  | {
      type: "decision";
      decision: "autoSave" | "needsReview";
      reasonCodes: ReceiptQualityReviewReasonCode[];
    }
  | { type: "autoSaveUndone" }
  | { type: "reviewSaved"; totalCorrected: boolean }
  | { type: "reviewDiscarded" };

export type ReceiptQualityMonthMetrics = {
  monthKey: string;
  processed: number;
  autoSaved: number;
  needsReview: number;
  autoSaveUndone: number;
  reviewsSaved: number;
  reviewTotalsCorrected: number;
  reviewsDiscarded: number;
  reviewReasons: Partial<Record<ReceiptQualityReviewReasonCode, number>>;
};

export type ReceiptQualitySummary = ReceiptQualityMonthMetrics & {
  autoSaveRate: number | null;
  undoRate: number | null;
  reviewTotalCorrectionRate: number | null;
};

type ReceiptQualityScopeMetrics = {
  months: Record<string, ReceiptQualityMonthMetrics>;
};

type StoredReceiptQualityMetrics = {
  version: 1;
  scopes: Record<string, ReceiptQualityScopeMetrics>;
};

export type ReceiptQualityMetricsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const REVIEW_REASON_CODES = [
  "ocr_failed",
  "total_missing",
  "total_uncertain",
  "total_conflict",
  "total_unrealistic",
  "balance_detected",
  "date_missing",
  "date_out_of_range",
  "merchant_missing",
  "merchant_uncertain",
  "merchant_conflict",
  "category_unresolved",
  "line_items_inconsistent",
  "batch_flow",
  "unknown",
] as const satisfies readonly ReceiptQualityReviewReasonCode[];

const REVIEW_REASON_CODE_SET = new Set<string>(REVIEW_REASON_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function createEmptyMonth(monthKey: string): ReceiptQualityMonthMetrics {
  return {
    monthKey,
    processed: 0,
    autoSaved: 0,
    needsReview: 0,
    autoSaveUndone: 0,
    reviewsSaved: 0,
    reviewTotalsCorrected: 0,
    reviewsDiscarded: 0,
    reviewReasons: {},
  };
}

function normalizeReasonCounts(value: unknown): ReceiptQualityMonthMetrics["reviewReasons"] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([code]) => REVIEW_REASON_CODE_SET.has(code))
      .map(([code, count]) => [code, toCount(count)]),
  ) as ReceiptQualityMonthMetrics["reviewReasons"];
}

function normalizeMonth(value: unknown, monthKey: string): ReceiptQualityMonthMetrics {
  if (!isRecord(value)) {
    return createEmptyMonth(monthKey);
  }

  return {
    monthKey,
    processed: toCount(value.processed),
    autoSaved: toCount(value.autoSaved),
    needsReview: toCount(value.needsReview),
    autoSaveUndone: toCount(value.autoSaveUndone),
    reviewsSaved: toCount(value.reviewsSaved),
    reviewTotalsCorrected: toCount(value.reviewTotalsCorrected),
    reviewsDiscarded: toCount(value.reviewsDiscarded),
    reviewReasons: normalizeReasonCounts(value.reviewReasons),
  };
}

function normalizeScope(value: unknown): ReceiptQualityScopeMetrics {
  if (!isRecord(value) || !isRecord(value.months)) {
    return { months: {} };
  }

  const months = Object.fromEntries(
    Object.entries(value.months)
      .filter(([monthKey]) => isMonthKey(monthKey))
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, RECEIPT_QUALITY_METRICS_RETENTION_MONTHS)
      .map(([monthKey, month]) => [monthKey, normalizeMonth(month, monthKey)]),
  );
  return { months };
}

function loadStoredMetrics(storage: ReceiptQualityMetricsStorage): StoredReceiptQualityMetrics {
  const rawValue = storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY);
  if (!rawValue) {
    return { version: 1, scopes: {} };
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue) || parsedValue.version !== 1 || !isRecord(parsedValue.scopes)) {
      return { version: 1, scopes: {} };
    }

    return {
      version: 1,
      scopes: Object.fromEntries(
        Object.entries(parsedValue.scopes)
          .filter(([scopeKey]) => scopeKey.trim().length > 0)
          .map(([scopeKey, scope]) => [scopeKey, normalizeScope(scope)]),
      ),
    };
  } catch {
    return { version: 1, scopes: {} };
  }
}

function saveStoredMetrics(storage: ReceiptQualityMetricsStorage, metrics: StoredReceiptQualityMetrics): void {
  storage.setItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY, JSON.stringify(metrics));
}

function trimMonths(months: Record<string, ReceiptQualityMonthMetrics>): Record<string, ReceiptQualityMonthMetrics> {
  return Object.fromEntries(
    Object.entries(months)
      .filter(([monthKey]) => isMonthKey(monthKey))
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, RECEIPT_QUALITY_METRICS_RETENTION_MONTHS),
  );
}

function applyEvent(month: ReceiptQualityMonthMetrics, event: ReceiptQualityEvent): ReceiptQualityMonthMetrics {
  const nextMonth: ReceiptQualityMonthMetrics = {
    ...month,
    reviewReasons: { ...month.reviewReasons },
  };

  if (event.type === "decision") {
    nextMonth.processed += 1;
    if (event.decision === "autoSave") {
      nextMonth.autoSaved += 1;
    } else {
      nextMonth.needsReview += 1;
      [...new Set(event.reasonCodes)].forEach((code) => {
        nextMonth.reviewReasons[code] = (nextMonth.reviewReasons[code] ?? 0) + 1;
      });
    }
  } else if (event.type === "autoSaveUndone") {
    nextMonth.autoSaveUndone += 1;
  } else if (event.type === "reviewSaved") {
    nextMonth.reviewsSaved += 1;
    if (event.totalCorrected) {
      nextMonth.reviewTotalsCorrected += 1;
    }
  } else {
    nextMonth.reviewsDiscarded += 1;
  }

  return nextMonth;
}

export function recordReceiptQualityEvent(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
  event: ReceiptQualityEvent,
  monthKey = currentMonthKey(),
): ReceiptQualitySummary {
  if (!scopeKey.trim() || !isMonthKey(monthKey)) {
    throw new Error("Invalid receipt quality metric scope or month");
  }

  const metrics = loadStoredMetrics(storage);
  const scope = metrics.scopes[scopeKey] ?? { months: {} };
  const currentMonth = normalizeMonth(scope.months[monthKey], monthKey);
  const nextMonth = applyEvent(currentMonth, event);
  metrics.scopes[scopeKey] = {
    months: trimMonths({ ...scope.months, [monthKey]: nextMonth }),
  };
  saveStoredMetrics(storage, metrics);
  return createReceiptQualitySummary(nextMonth);
}

export function getReceiptQualitySummary(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
  monthKey = currentMonthKey(),
): ReceiptQualitySummary {
  const metrics = loadStoredMetrics(storage);
  const month = normalizeMonth(metrics.scopes[scopeKey]?.months[monthKey], monthKey);
  return createReceiptQualitySummary(month);
}

export function clearReceiptQualityMetrics(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
): void {
  const metrics = loadStoredMetrics(storage);
  delete metrics.scopes[scopeKey];
  if (Object.keys(metrics.scopes).length === 0) {
    storage.removeItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY);
    return;
  }
  saveStoredMetrics(storage, metrics);
}

export function createReceiptQualitySummary(month: ReceiptQualityMonthMetrics): ReceiptQualitySummary {
  return {
    ...month,
    reviewReasons: { ...month.reviewReasons },
    autoSaveRate: month.processed > 0 ? month.autoSaved / month.processed : null,
    undoRate: month.autoSaved > 0 ? month.autoSaveUndone / month.autoSaved : null,
    reviewTotalCorrectionRate: month.reviewsSaved > 0
      ? month.reviewTotalsCorrected / month.reviewsSaved
      : null,
  };
}

export function createEmptyReceiptQualitySummary(monthKey = currentMonthKey()): ReceiptQualitySummary {
  return createReceiptQualitySummary(createEmptyMonth(monthKey));
}
