import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReceiptConfidenceAssessment, ReceiptReviewCause } from "../types";
import { currentMonthKey } from "../lib/date";
import { RECEIPT_CONFIDENCE_POLICY_VERSION } from "../lib/receiptConfidence";
import {
  LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  clearReceiptQualityMetrics,
  createEmptyReceiptQualitySummary,
  formatReceiptQualityReport,
  getReceiptQualityMonthKeys,
  getReceiptQualitySummary,
  normalizeReceiptQualityPolicyVersion,
  recordReceiptQualityEvent,
  type ReceiptQualityEvent,
  type ReceiptQualityReviewReasonCode,
} from "../lib/receiptQualityMetrics";

const LOCAL_SCOPE_KEY = "local";

function getBlockingReasonCodes(
  assessment: ReceiptConfidenceAssessment | undefined,
): ReceiptQualityReviewReasonCode[] {
  const codes = assessment?.reasons
    .filter((reason) => reason.severity === "blocking")
    .map((reason) => reason.code) ?? [];
  return codes.length > 0 ? codes : ["unknown"];
}

function getAssessmentPolicyVersion(assessment: ReceiptConfidenceAssessment | undefined): string {
  return normalizeReceiptQualityPolicyVersion(assessment?.policyVersion);
}

export function useReceiptQualityMetrics(householdId: string | null) {
  const scopeKey = householdId ?? LOCAL_SCOPE_KEY;
  const initialMonthKey = currentMonthKey();
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const [monthKeys, setMonthKeys] = useState<string[]>([initialMonthKey]);
  const [summary, setSummary] = useState(() => createEmptyReceiptQualitySummary(initialMonthKey));
  const [error, setError] = useState<string | null>(null);

  const loadMonth = useCallback((monthKey: string) => {
    try {
      const nextMonthKeys = getReceiptQualityMonthKeys(window.localStorage, scopeKey);
      const nextMonthKey = nextMonthKeys.includes(monthKey) ? monthKey : nextMonthKeys[0] ?? currentMonthKey();
      setSelectedMonthKey(nextMonthKey);
      setMonthKeys(nextMonthKeys);
      setSummary(getReceiptQualitySummary(window.localStorage, scopeKey, nextMonthKey));
      setError(null);
    } catch {
      setMonthKeys([currentMonthKey()]);
      setSummary(createEmptyReceiptQualitySummary(monthKey));
      setError("この端末の自動登録集計を読み込めませんでした");
    }
  }, [scopeKey]);

  const refresh = useCallback(() => {
    loadMonth(selectedMonthKey);
  }, [loadMonth, selectedMonthKey]);

  useEffect(() => {
    const monthKey = currentMonthKey();
    setSelectedMonthKey(monthKey);
    loadMonth(monthKey);
  }, [loadMonth]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === RECEIPT_QUALITY_METRICS_STORAGE_KEY
        || event.key === LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refresh]);

  const selectMonth = useCallback((monthKey: string) => {
    setSelectedMonthKey(monthKey);
    loadMonth(monthKey);
  }, [loadMonth]);

  const recordEvent = useCallback((event: ReceiptQualityEvent, targetScopeKey = scopeKey) => {
    try {
      const nextSummary = recordReceiptQualityEvent(window.localStorage, targetScopeKey, event);
      if (targetScopeKey === scopeKey) {
        setMonthKeys(getReceiptQualityMonthKeys(window.localStorage, scopeKey));
        if (selectedMonthKey === nextSummary.monthKey) {
          setSummary(nextSummary);
        }
      }
      setError(null);
    } catch {
      setError("この端末の自動登録集計を更新できませんでした");
    }
  }, [scopeKey, selectedMonthKey]);

  const recordAutoSave = useCallback((assessment: ReceiptConfidenceAssessment | undefined) => {
    recordEvent({
      type: "decision",
      decision: "autoSave",
      policyVersion: getAssessmentPolicyVersion(assessment),
      reasonCodes: assessment?.reasons
        .filter((reason) => reason.severity === "blocking")
        .map((reason) => reason.code) ?? [],
    });
  }, [recordEvent]);

  const recordNeedsReview = useCallback((
    assessments: Array<ReceiptConfidenceAssessment | undefined>,
    cause: ReceiptReviewCause,
  ) => {
    assessments.forEach((assessment) => {
      const reasonCodes = getBlockingReasonCodes(assessment);
      recordEvent({
        type: "decision",
        decision: "needsReview",
        policyVersion: getAssessmentPolicyVersion(assessment),
        reasonCodes: cause === "batch" ? ["batch_flow", ...reasonCodes.filter((code) => code !== "unknown")] : reasonCodes,
      });
    });
  }, [recordEvent]);

  const recordUndo = useCallback((targetScopeKey?: string, policyVersion = RECEIPT_CONFIDENCE_POLICY_VERSION) => {
    recordEvent({
      type: "autoSaveUndone",
      policyVersion: normalizeReceiptQualityPolicyVersion(policyVersion),
    }, targetScopeKey);
  }, [recordEvent]);

  const recordReviewSaved = useCallback((
    assessment: ReceiptConfidenceAssessment | undefined,
    totalCorrected: boolean,
  ) => {
    recordEvent({
      type: "reviewSaved",
      policyVersion: getAssessmentPolicyVersion(assessment),
      totalCorrected,
    });
  }, [recordEvent]);

  const recordReviewDiscarded = useCallback((assessment: ReceiptConfidenceAssessment | undefined) => {
    recordEvent({
      type: "reviewDiscarded",
      policyVersion: getAssessmentPolicyVersion(assessment),
    });
  }, [recordEvent]);

  const clearMetrics = useCallback(() => {
    try {
      clearReceiptQualityMetrics(window.localStorage, scopeKey);
      const monthKey = currentMonthKey();
      setSelectedMonthKey(monthKey);
      setMonthKeys([monthKey]);
      setSummary(createEmptyReceiptQualitySummary(monthKey));
      setError(null);
      return true;
    } catch {
      setError("この端末の自動登録集計を消去できませんでした");
      return false;
    }
  }, [scopeKey]);

  const reportText = useMemo(() => formatReceiptQualityReport(summary), [summary]);

  return {
    scopeKey,
    selectedMonthKey,
    monthKeys,
    summary,
    reportText,
    error,
    refresh,
    selectMonth,
    recordAutoSave,
    recordNeedsReview,
    recordUndo,
    recordReviewSaved,
    recordReviewDiscarded,
    clearMetrics,
  };
}

export type ReceiptQualityMetricsState = ReturnType<typeof useReceiptQualityMetrics>;
