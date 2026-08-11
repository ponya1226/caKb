import { describe, expect, it } from "vitest";
import type { ReceiptDraft } from "../types";
import {
  PENDING_RECEIPT_REVIEW_RETENTION_DAYS,
  createPendingReceiptReview,
  restorePendingReceiptReview,
} from "./pendingReceiptReview";

function createDraft(): ReceiptDraft {
  return {
    imageFile: new File(["anonymous receipt"], "anonymous-receipt.png", { type: "image/png" }),
    imagePreviewUrl: "blob:fixture-preview",
    ocrText: "SAMPLE STORE\n2026年08月10日\n合計 ¥500",
    parseResult: {
      dateCandidates: [],
      shopNameCandidates: [],
      amountCandidates: [],
      lineItemCandidates: [],
      riskSignals: { balanceAmounts: [] },
    },
    initialValues: {
      date: "2026-08-10",
      shopName: "サンプルストア",
      amount: 500,
      categoryId: "other",
      memo: "",
    },
    confidenceAssessment: {
      policyVersion: "receipt-confidence-v1",
      decision: "needsReview",
      signals: {
        ocrSucceeded: true,
        totalResolved: true,
        dateResolved: true,
        merchantResolved: true,
        categoryResolved: false,
        conflictingAmounts: false,
        conflictingMerchants: false,
        suspiciousBalanceCandidate: false,
        lineItemConsistency: "unknown",
      },
      reasons: [{ code: "category_unresolved", message: "カテゴリを確認", severity: "blocking" }],
    },
  };
}

describe("pendingReceiptReview", () => {
  it("creates a device-local review that expires after seven days", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const review = createPendingReceiptReview(createDraft(), "household:test", undefined, now);

    expect(review.id).toMatch(/^pending_receipt_/);
    expect(review.scopeKey).toBe("household:test");
    expect(review.createdAt).toBe(now.toISOString());
    expect(review.expiresAt).toBe(
      new Date(now.getTime() + PENDING_RECEIPT_REVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(review.imageName).toBe("anonymous-receipt.png");
    expect(review.ocrText).toContain("SAMPLE STORE");
  });

  it("restores a persisted review as an editable receipt draft", () => {
    const draft = createDraft();
    const review = createPendingReceiptReview(draft, "household:test", undefined, new Date("2026-08-10T00:00:00.000Z"));
    const restored = restorePendingReceiptReview(review, () => "blob:restored-preview");

    expect(restored.pendingReviewId).toBe(review.id);
    expect(restored.imagePreviewUrl).toBe("blob:restored-preview");
    expect(restored.imageFile.name).toBe("anonymous-receipt.png");
    expect(restored.initialValues).toEqual(draft.initialValues);
    expect(restored.confidenceAssessment?.decision).toBe("needsReview");
    expect(restored.confidenceAssessment?.policyVersion).toBe("receipt-confidence-v1");
  });

  it("preserves the original retention deadline when a review is updated", () => {
    const draft = createDraft();
    const original = createPendingReceiptReview(draft, "household:test", undefined, new Date("2026-08-10T00:00:00.000Z"));
    const updated = createPendingReceiptReview(
      { ...draft, pendingReviewId: original.id, ocrText: `${draft.ocrText}\n再読み取り` },
      "household:test",
      original,
      new Date("2026-08-11T00:00:00.000Z"),
    );

    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.expiresAt).toBe(original.expiresAt);
    expect(updated.updatedAt).toBe("2026-08-11T00:00:00.000Z");
    expect(updated.ocrText).toContain("再読み取り");
  });
});
