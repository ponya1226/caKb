import { useCallback, useEffect, useState } from "react";
import type { ReceiptConfidenceAssessment, ReceiptReviewCause } from "../types";
import {
  RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  clearReceiptQualityMetrics,
  createEmptyReceiptQualitySummary,
  getReceiptQualitySummary,
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

export function useReceiptQualityMetrics(householdId: string | null) {
  const scopeKey = householdId ?? LOCAL_SCOPE_KEY;
  const [summary, setSummary] = useState(() => createEmptyReceiptQualitySummary());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setSummary(getReceiptQualitySummary(window.localStorage, scopeKey));
      setError(null);
    } catch {
      setSummary(createEmptyReceiptQualitySummary());
      setError("この端末の自動登録集計を読み込めませんでした");
    }
  }, [scopeKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RECEIPT_QUALITY_METRICS_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refresh]);

  const recordEvent = useCallback((event: ReceiptQualityEvent, targetScopeKey = scopeKey) => {
    try {
      const nextSummary = recordReceiptQualityEvent(window.localStorage, targetScopeKey, event);
      if (targetScopeKey === scopeKey) {
        setSummary(nextSummary);
      }
      setError(null);
    } catch {
      setError("この端末の自動登録集計を更新できませんでした");
    }
  }, [scopeKey]);

  const recordAutoSave = useCallback((assessment: ReceiptConfidenceAssessment | undefined) => {
    recordEvent({
      type: "decision",
      decision: "autoSave",
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
        reasonCodes: cause === "batch" ? ["batch_flow", ...reasonCodes.filter((code) => code !== "unknown")] : reasonCodes,
      });
    });
  }, [recordEvent]);

  const recordUndo = useCallback((targetScopeKey?: string) => {
    recordEvent({ type: "autoSaveUndone" }, targetScopeKey);
  }, [recordEvent]);

  const recordReviewSaved = useCallback((totalCorrected: boolean) => {
    recordEvent({ type: "reviewSaved", totalCorrected });
  }, [recordEvent]);

  const recordReviewDiscarded = useCallback(() => {
    recordEvent({ type: "reviewDiscarded" });
  }, [recordEvent]);

  const clearMetrics = useCallback(() => {
    try {
      clearReceiptQualityMetrics(window.localStorage, scopeKey);
      setSummary(createEmptyReceiptQualitySummary());
      setError(null);
      return true;
    } catch {
      setError("この端末の自動登録集計を消去できませんでした");
      return false;
    }
  }, [scopeKey]);

  return {
    scopeKey,
    summary,
    error,
    refresh,
    recordAutoSave,
    recordNeedsReview,
    recordUndo,
    recordReviewSaved,
    recordReviewDiscarded,
    clearMetrics,
  };
}

export type ReceiptQualityMetricsState = ReturnType<typeof useReceiptQualityMetrics>;
