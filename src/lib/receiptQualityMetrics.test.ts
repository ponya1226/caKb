import { describe, expect, it } from "vitest";
import {
  RECEIPT_QUALITY_METRICS_RETENTION_MONTHS,
  RECEIPT_QUALITY_METRICS_STORAGE_KEY,
  clearReceiptQualityMetrics,
  getReceiptQualitySummary,
  recordReceiptQualityEvent,
  type ReceiptQualityMetricsStorage,
} from "./receiptQualityMetrics";

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
      reasonCodes: [],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "autoSave",
      reasonCodes: [],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, {
      type: "decision",
      decision: "needsReview",
      reasonCodes: ["total_conflict", "category_unresolved", "total_conflict"],
    }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, { type: "autoSaveUndone" }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, { type: "reviewSaved", totalCorrected: true }, monthKey);
    recordReceiptQualityEvent(storage, scopeKey, { type: "reviewDiscarded" }, monthKey);

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

    const serialized = storage.getItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY) ?? "";
    expect(serialized).not.toMatch(/shopName|ocrText|imageBlob|lineItems|expenseId|email|uid/);
  });

  it("isolates household scopes and clears only the selected scope", () => {
    const storage = new MemoryStorage();
    recordReceiptQualityEvent(storage, "household:one", {
      type: "decision",
      decision: "autoSave",
      reasonCodes: [],
    }, "2026-08");
    recordReceiptQualityEvent(storage, "household:two", {
      type: "decision",
      decision: "needsReview",
      reasonCodes: ["batch_flow"],
    }, "2026-08");

    expect(getReceiptQualitySummary(storage, "household:one", "2026-08").autoSaved).toBe(1);
    expect(getReceiptQualitySummary(storage, "household:one", "2026-08").needsReview).toBe(0);
    expect(getReceiptQualitySummary(storage, "household:two", "2026-08").autoSaved).toBe(0);
    expect(getReceiptQualitySummary(storage, "household:two", "2026-08").needsReview).toBe(1);

    clearReceiptQualityMetrics(storage, "household:one");
    expect(getReceiptQualitySummary(storage, "household:one", "2026-08").processed).toBe(0);
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

    storage.setItem(RECEIPT_QUALITY_METRICS_STORAGE_KEY, JSON.stringify({ version: 2, scopes: {} }));
    expect(getReceiptQualitySummary(storage, "household:sample", "2026-08").processed).toBe(0);
  });
});
