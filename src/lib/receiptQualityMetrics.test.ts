import { describe, expect, it } from "vitest";
import {
  LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  LEGACY_RECEIPT_QUALITY_POLICY_VERSION,
  RECEIPT_QUALITY_METRICS_RETENTION_MONTHS,
  RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  clearReceiptQualityMetrics,
  formatReceiptQualityReport,
  getReceiptQualityMonthKeys,
  getReceiptQualitySummary,
  recordReceiptQualityEvent,
  type ReceiptQualityMetricsStorage,
} from "./receiptQualityMetrics";

const POLICY_V1 = "receipt-confidence-v1";
const POLICY_V2 = "receipt-confidence-v2";

class MemoryStorage implements ReceiptQualityMetricsStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("receiptQualityMetrics", () => {
  it("aggregates actual routing and review outcomes without receipt content", () => {
    const storage = new MemoryStorage();
    const scopeKey = "household:sample";
    const monthKey = "2026-08";

    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "needsReview",
      policyVersion: POLICY_V1,
      reasonCodes: ["total_conflict", "category_unresolved", "total_conflict"],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "autoSaveUndone",
      policyVersion: POLICY_V1,
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "reviewSaved",
      policyVersion: POLICY_V1,
      totalCorrected: true,
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "reviewDiscarded",
      policyVersion: POLICY_V1,
    }, monthKey);

    const summary = getReceiptQualitySummary(storage, scopeKey, monthKey);
    expect(summary).toMatchObject({
      processed: 3,
      autoSaved: 2,
      needsReview: 1,
      autoSaveUndone: 1,
      reviewsSaved: 1,
      reviewTotalsCorrected: 1,
      reviewsDiscarded: 1,
      autoSaveRate: 2 / 3,
      undoRate: 1 / 2,
      reviewTotalCorrectionRate: 1,
      reviewReasons: {
        total_conflict: 1,
        category_unresolved: 1,
      },
    });
    expect(summary.policySummaries).toHaveLength(1);
    expect(summary.policySummaries[0]).toMatchObject({
      policyVersion: POLICY_V1,
      processed: 3,
      autoSaved: 2,
      needsReview: 1,
    });

    const serialized = storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY) ?? "";
    expect(serialized).not.toMatch(/shopName|ocrText|imageBlob|lineItems|expenseId|email|uid/);

    const report = formatReceiptQualityReport(summary);
    expect(report).toContain("対象月: 2026年8月");
    expect(report).toContain("支払総額の候補が競合: 1件");
    expect(report).toContain(POLICY_V1);
    expect(report).not.toContain(scopeKey);
    expect(report).not.toMatch(/shopName|ocrText|imageBlob|lineItems|expenseId|email|uid/);
  });

  it("keeps policy versions separate while calculating a combined month summary", () => {
    const storage = new MemoryStorage();
    const scopeKey = "household:sample";

    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, "2026-08");
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "needsReview",
      policyVersion: POLICY_V2,
      reasonCodes: ["total_uncertain"],
    }, "2026-08");

    const summary = getReceiptQualitySummary(storage, scopeKey, "2026-08");
    expect(summary.processed).toBe(2);
    expect(summary.autoSaveRate).toBe(0.5);
    expect(summary.policySummaries).toEqual([
      expect.objectContaining({ policyVersion: POLICY_V1, processed: 1, autoSaved: 1 }),
      expect.objectContaining({ policyVersion: POLICY_V2, processed: 1, needsReview: 1 }),
    ]);
  });

  it("reads version one counters as legacy and migrates them on the next write", () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY, JSON.stringify({
      version: 1,
      scopes: {
        "household:sample": {
          months: {
            "2026-07": {
              monthKey: "2026-07",
              processed: 2,
              autoSaved: 1,
              needsReview: 1,
              autoSaveUndone: 0,
              reviewsSaved: 1,
              reviewTotalsCorrected: 0,
              reviewsDiscarded: 0,
              reviewReasons: { category_unresolved: 1 },
            },
          },
        },
      },
    }));

    const legacySummary = getReceiptQualitySummary(storage, "household:sample", "2026-07");
    expect(legacySummary.processed).toBe(2);
    expect(legacySummary.policySummaries[0]?.policyVersion).toBe(LEGACY_RECEIPT_QUALITY_POLICY_VERSION);

    recordReceiptQualityEvent(storage, "household:sample", {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, "2026-07");

    expect(storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_RECEIPT_QUALITY_METRICS_STORAGE_KEY)).toBeNull();
    const migratedSummary = getReceiptQualitySummary(storage, "household:sample", "2026-07");
    expect(migratedSummary.processed).toBe(3);
    expect(migratedSummary.policySummaries.map((policy) => policy.policyVersion)).toEqual([
      LEGACY_RECEIPT_QUALITY_POLICY_VERSION,
      POLICY_V1,
    ]);
  });

  it("lists retained months, isolates household scopes, and clears only the selected scope", () => {
    const storage = new MemoryStorage();
    recordReceiptQualityEvent(storage, "household:one", {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, "2026-06");
    recordReceiptQualityEvent(storage, "household:one", {
      type: "decision",
      decision: "needsReview",
      policyVersion: POLICY_V1,
      reasonCodes: ["batch_flow"],
    }, "2026-07");
    recordReceiptQualityEvent(storage, "household:two", {
      type: "decision",
      decision: "autoSave",
      policyVersion: POLICY_V1,
      reasonCodes: [],
    }, "2026-08");

    expect(getReceiptQualityMonthKeys(storage, "household:one", "2026-08")).toEqual([
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
    expect(getReceiptQualitySummary(storage, "household:two", "2026-08").processed).toBe(1);

    clearReceiptQualityMetrics(storage, "household:one");
    expect(getReceiptQualitySummary(storage, "household:one", "2026-07").processed).toBe(0);
    expect(getReceiptQualitySummary(storage, "household:two", "2026-08").processed).toBe(1);
  });

  it("retains only the most recent twelve months", () => {
    const storage = new MemoryStorage();
    const scopeKey = "household:sample";
    const months = Array.from({ length: RECEIPT_QUALITY_METRICS_RETENTION_MONTHS + 1 }, (_, index) => {
      const date = new Date(2025, index, 1);
      return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
    });

    months.forEach((monthKey) => {
      recordReceiptQualityEvent(storage, scopeKey, {
        type: "decision",
        decision: "autoSave",
        policyVersion: POLICY_V1,
        reasonCodes: [],
      }, monthKey);
    });

    const serialized = storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain(`"${months[0]}"`);
    expect(serialized).toContain(`"${months[months.length - 1]}"`);
  });

  it("recovers from malformed or unsupported stored values", () => {
    const storage = new MemoryStorage();
    storage.setItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY, "{broken");
    expect(getReceiptQualitySummary(storage, "household:sample", "2026-08").processed).toBe(0);

    storage.setItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY, JSON.stringify({ version: 3, scopes: {} }));
    expect(getReceiptQualitySummary(storage, "household:sample", "2026-08").processed).toBe(0);

    recordReceiptQualityEvent(storage, "household:sample", {
      type: "decision",
      decision: "autoSave",
      policyVersion: "invalid policy value",
      reasonCodes: [],
    }, "2026-08");
    expect(getReceiptQualitySummary(storage, "household:sample", "2026-08").policySummaries[0]?.policyVersion)
      .toBe(LEGACY_RECEIPT_QUALITY_POLICY_VERSION);
  });
});
