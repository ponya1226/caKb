import type { ReceiptConfidenceReasonCode } from "../types";
import { currentMonthKey, formatMonthLabel } from "./date";

export const RECEIPT_QUALITY_METRICS_STORAGE_KEY = "cakb-receipt-quality-metrics-v2";
export const LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY = "cakb-receipt-quality-metrics-v1";
export const RECEIPT_QUALITY_METRICS_RETENTION_MONTHS = 12;
export const LEGACY_RECEIPT_QUALITY_POLICY_VERSION = "legacy";

export type ReceiptQualityReviewReasonCode = ReceiptConfidenceReasonCode | "batch_flow" | "unknown";

export type ReceiptQualityEvent =
  | {
      type: "decision";
      decision: "autoSave" | "needsReview";
      policyVersion: string;
      reasonCodes: ReceiptQualityReviewReasonCode[];
    }
  | { type: "autoSaveUndone"; policyVersion: string }
  | { type: "reviewSaved"; policyVersion: string; totalCorrected: boolean }
  | { type: "reviewDiscarded"; policyVersion: string };

export type ReceiptQualityCounters = {
  processed: number;
  autoSaved: number;
  needsReview: number;
  autoSaveUndone: number;
  reviewsSaved: number;
  reviewTotalsCorrected: number;
  reviewsDiscarded: number;
  reviewReasons: Partial<Record<ReceiptQualityReviewReasonCode, number>>;
};

type ReceiptQualityRates = {
  autoSaveRate: number | null;
  undoRate: number | null;
  reviewTotalCorrectionRate: number | null;
};

export type ReceiptQualityPolicySummary = ReceiptQualityCounters & ReceiptQualityRates & {
  policyVersion: string;
};

export type ReceiptQualitySummary = ReceiptQualityCounters & ReceiptQualityRates & {
  monthKey: string;
  policySummaries: ReceiptQualityPolicySummary[];
};

type StoredReceiptQualityMonthMetrics = {
  policies: Record<string, ReceiptQualityCounters>;
};

type ReceiptQualityScopeMetrics = {
  months: Record<string, StoredReceiptQualityMonthMetrics>;
};

type StoredReceiptQualityMetrics = {
  version: 2;
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

export const RECEIPT_QUALITY_REVIEW_REASON_LABELS = {
  ocr_failed: "読み取れた文字が不足",
  total_missing: "支払総額を特定できない",
  total_uncertain: "支払総額が不確か",
  total_conflict: "支払総額の候補が競合",
  total_unrealistic: "支払総額が通常範囲外",
  balance_detected: "残高候補を検出",
  date_missing: "利用日を特定できない",
  date_out_of_range: "利用日が通常範囲外",
  merchant_missing: "店舗名を特定できない",
  merchant_uncertain: "店舗名が不確か",
  merchant_conflict: "店舗名の候補が競合",
  category_unresolved: "カテゴリを判断できない",
  line_items_inconsistent: "品目合計に差がある",
  batch_flow: "複数枚のため確認",
  unknown: "判定情報が不足",
} satisfies Record<ReceiptQualityReviewReasonCode, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function normalizeReceiptQualityPolicyVersion(value: unknown): string {
  if (typeof value !== "string") {
    return LEGACY_RECEIPT_QUALITY_POLICY_VERSION;
  }

  const normalized = value.trim();
  return /^[a-zA-Z0-9._-]{1,64}$/.test(normalized)
    ? normalized
    : LEGACY_RECEIPT_QUALITY_POLICY_VERSION;
}

function createEmptyCounters(): ReceiptQualityCounters {
  return {
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

function normalizeReasonCounts(value: unknown): ReceiptQualityCounters["reviewReasons"] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([code]) => REVIEW_REASON_CODE_SET.has(code))
      .map(([code, count]) => [code, toCount(count)]),
  ) as ReceiptQualityCounters["reviewReasons"];
}

function normalizeCounters(value: unknown): ReceiptQualityCounters {
  if (!isRecord(value)) {
    return createEmptyCounters();
  }

  return {
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

function addCounters(left: ReceiptQualityCounters, right: ReceiptQualityCounters): ReceiptQualityCounters {
  const reviewReasons = { ...left.reviewReasons };
  Object.entries(right.reviewReasons).forEach(([code, count]) => {
    if (typeof count === "number") {
      const reasonCode = code as ReceiptQualityReviewReasonCode;
      reviewReasons[reasonCode] = (reviewReasons[reasonCode] ?? 0) + count;
    }
  });

  return {
    processed: left.processed + right.processed,
    autoSaved: left.autoSaved + right.autoSaved,
    needsReview: left.needsReview + right.needsReview,
    autoSaveUndone: left.autoSaveUndone + right.autoSaveUndone,
    reviewsSaved: left.reviewsSaved + right.reviewsSaved,
    reviewTotalsCorrected: left.reviewTotalsCorrected + right.reviewTotalsCorrected,
    reviewsDiscarded: left.reviewsDiscarded + right.reviewsDiscarded,
    reviewReasons,
  };
}

function normalizeMonth(value: unknown): StoredReceiptQualityMonthMetrics {
  if (!isRecord(value) || !isRecord(value.policies)) {
    return { policies: {} };
  }

  const policies: Record<string, ReceiptQualityCounters> = {};
  Object.entries(value.policies).forEach(([policyVersion, counters]) => {
    const normalizedVersion = normalizeReceiptQualityPolicyVersion(policyVersion);
    policies[normalizedVersion] = addCounters(
      policies[normalizedVersion] ?? createEmptyCounters(),
      normalizeCounters(counters),
    );
  });
  return { policies };
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
      .map(([monthKey, month]) => [monthKey, normalizeMonth(month)]),
  );
  return { months };
}

function parseVersionTwo(rawValue: string | null): StoredReceiptQualityMetrics | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue) || parsedValue.version !== 2 || !isRecord(parsedValue.scopes)) {
      return null;
    }
    return {
      version: 2,
      scopes: Object.fromEntries(
        Object.entries(parsedValue.scopes)
          .filter(([scopeKey]) => scopeKey.trim().length > 0)
          .map(([scopeKey, scope]) => [scopeKey, normalizeScope(scope)]),
      ),
    };
  } catch {
    return null;
  }
}

function parseVersionOne(rawValue: string | null): StoredReceiptQualityMetrics | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!isRecord(parsedValue) || parsedValue.version !== 1 || !isRecord(parsedValue.scopes)) {
      return null;
    }

    const scopes: Record<string, ReceiptQualityScopeMetrics> = {};
    Object.entries(parsedValue.scopes).forEach(([scopeKey, scopeValue]) => {
      if (!scopeKey.trim() || !isRecord(scopeValue) || !isRecord(scopeValue.months)) {
        return;
      }

      const months = Object.fromEntries(
        Object.entries(scopeValue.months)
          .filter(([monthKey]) => isMonthKey(monthKey))
          .sort(([left], [right]) => right.localeCompare(left))
          .slice(0, RECEIPT_QUALITY_METRICS_RETENTION_MONTHS)
          .map(([monthKey, counters]) => [monthKey, {
            policies: {
              [LEGACY_RECEIPT_QUALITY_POLICY_VERSION]: normalizeCounters(counters),
            },
          }]),
      );
      scopes[scopeKey] = { months };
    });
    return { version: 2, scopes };
  } catch {
    return null;
  }
}

function loadStoredMetrics(storage: ReceiptQualityMetricsStorage): StoredReceiptQualityMetrics {
  return parseVersionTwo(storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY))
    ?? parseVersionOne(storage.getItem(LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY))
    ?? { version: 2, scopes: {} };
}

function saveStoredMetrics(storage: ReceiptQualityMetricsStorage, metrics: StoredReceiptQualityMetrics): void {
  storage.setItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY, JSON.stringify(metrics));
  storage.removeItem(LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY);
}

function trimMonths(months: Record<string, StoredReceiptQualityMonthMetrics>): Record<string, StoredReceiptQualityMonthMetrics> {
  return Object.fromEntries(
    Object.entries(months)
      .filter(([monthKey]) => isMonthKey(monthKey))
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, RECEIPT_QUALITY_METRICS_RETENTION_MONTHS),
  );
}

function applyEvent(counters: ReceiptQualityCounters, event: ReceiptQualityEvent): ReceiptQualityCounters {
  const nextCounters: ReceiptQualityCounters = {
    ...counters,
    reviewReasons: { ...counters.reviewReasons },
  };

  if (event.type === "decision") {
    nextCounters.processed += 1;
    if (event.decision === "autoSave") {
      nextCounters.autoSaved += 1;
    } else {
      nextCounters.needsReview += 1;
      [...new Set(event.reasonCodes)].forEach((code) => {
        nextCounters.reviewReasons[code] = (nextCounters.reviewReasons[code] ?? 0) + 1;
      });
    }
  } else if (event.type === "autoSaveUndone") {
    nextCounters.autoSaveUndone += 1;
  } else if (event.type === "reviewSaved") {
    nextCounters.reviewsSaved += 1;
    if (event.totalCorrected) {
      nextCounters.reviewTotalsCorrected += 1;
    }
  } else {
    nextCounters.reviewsDiscarded += 1;
  }

  return nextCounters;
}

function createRates(counters: ReceiptQualityCounters): ReceiptQualityRates {
  return {
    autoSaveRate: counters.processed > 0 ? counters.autoSaved / counters.processed : null,
    undoRate: counters.autoSaved > 0 ? counters.autoSaveUndone / counters.autoSaved : null,
    reviewTotalCorrectionRate: counters.reviewsSaved > 0
      ? counters.reviewTotalsCorrected / counters.reviewsSaved
      : null,
  };
}

function createPolicySummary(policyVersion: string, counters: ReceiptQualityCounters): ReceiptQualityPolicySummary {
  return {
    policyVersion,
    ...counters,
    reviewReasons: { ...counters.reviewReasons },
    ...createRates(counters),
  };
}

function createSummary(monthKey: string, month: StoredReceiptQualityMonthMetrics): ReceiptQualitySummary {
  const policySummaries = Object.entries(month.policies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([policyVersion, counters]) => createPolicySummary(policyVersion, counters));
  const counters = policySummaries.reduce<ReceiptQualityCounters>(
    (total, policy) => addCounters(total, policy),
    createEmptyCounters(),
  );

  return {
    monthKey,
    ...counters,
    reviewReasons: { ...counters.reviewReasons },
    ...createRates(counters),
    policySummaries,
  };
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
  const month = normalizeMonth(scope.months[monthKey]);
  const policyVersion = normalizeReceiptQualityPolicyVersion(event.policyVersion);
  month.policies[policyVersion] = applyEvent(
    normalizeCounters(month.policies[policyVersion]),
    { ...event, policyVersion },
  );
  metrics.scopes[scopeKey] = {
    months: trimMonths({ ...scope.months, [monthKey]: month }),
  };
  saveStoredMetrics(storage, metrics);
  return createSummary(monthKey, month);
}

export function getReceiptQualitySummary(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
  monthKey = currentMonthKey(),
): ReceiptQualitySummary {
  const metrics = loadStoredMetrics(storage);
  const month = normalizeMonth(metrics.scopes[scopeKey]?.months[monthKey]);
  return createSummary(monthKey, month);
}

export function getReceiptQualityMonthKeys(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
  includedMonthKey = currentMonthKey(),
): string[] {
  const metrics = loadStoredMetrics(storage);
  const storedMonthKeys = Object.keys(metrics.scopes[scopeKey]?.months ?? {}).filter(isMonthKey);
  return [...new Set([includedMonthKey, ...storedMonthKeys])]
    .filter(isMonthKey)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, RECEIPT_QUALITY_METRICS_RETENTION_MONTHS);
}

export function clearReceiptQualityMetrics(
  storage: ReceiptQualityMetricsStorage,
  scopeKey: string,
): void {
  const metrics = loadStoredMetrics(storage);
  delete metrics.scopes[scopeKey];
  if (Object.keys(metrics.scopes).length === 0) {
    storage.removeItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY);
    storage.removeItem(LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY);
    return;
  }
  saveStoredMetrics(storage, metrics);
}

export function createEmptyReceiptQualitySummary(monthKey = currentMonthKey()): ReceiptQualitySummary {
  return createSummary(monthKey, { policies: {} });
}

function formatRate(rate: number | null): string {
  return rate === null ? "対象なし" : `${Math.round(rate * 100)}%`;
}

export function formatReceiptQualityReport(summary: ReceiptQualitySummary): string {
  const lines = [
    "caKb 自動登録状況",
    `対象月: ${formatMonthLabel(summary.monthKey)}`,
    "範囲: この端末のみ",
    `読み取ったレシート: ${summary.processed}件`,
    `自動登録: ${summary.autoSaved}件 (${formatRate(summary.autoSaveRate)})`,
    `確認が必要: ${summary.needsReview}件`,
    `自動登録を元に戻した割合: ${summary.autoSaveUndone}件 (${formatRate(summary.undoRate)})`,
    `確認時に総額を直した割合: ${summary.reviewTotalsCorrected}件 (${formatRate(summary.reviewTotalCorrectionRate)})`,
    `確認せず削除: ${summary.reviewsDiscarded}件`,
  ];

  const reviewReasons = Object.entries(summary.reviewReasons)
    .filter((entry): entry is [ReceiptQualityReviewReasonCode, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((left, right) => right[1] - left[1]);
  if (reviewReasons.length > 0) {
    lines.push("確認になった理由:");
    reviewReasons.forEach(([code, count]) => {
      lines.push(`- ${RECEIPT_QUALITY_REVIEW_REASON_LABELS[code]}: ${count}件`);
    });
  }

  if (summary.policySummaries.length > 0) {
    lines.push("判定ルール別:");
    summary.policySummaries.forEach((policy) => {
      lines.push(`- ${policy.policyVersion}: 読み取り${policy.processed}件 / 自動登録${policy.autoSaved}件 / 要確認${policy.needsReview}件`);
    });
  }

  return lines.join("\n");
}
