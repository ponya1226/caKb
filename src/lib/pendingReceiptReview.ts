import type { PendingReceiptReview, ReceiptDraft } from "../types";
import { createId } from "./id";

export const PENDING_RECEIPT_REVIEW_RETENTION_DAYS = 7;

export function createPendingReceiptReview(
  draft: ReceiptDraft,
  scopeKey: string,
  existing?: PendingReceiptReview,
  now = new Date(),
): PendingReceiptReview {
  const nowIso = now.toISOString();
  const expiresAt = existing?.expiresAt
    ?? new Date(now.getTime() + PENDING_RECEIPT_REVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  return {
    id: draft.pendingReviewId ?? existing?.id ?? createId("pending_receipt"),
    scopeKey,
    imageBlob: draft.imageFile,
    imageName: draft.imageFile.name || "receipt-image",
    imageType: draft.imageFile.type || "application/octet-stream",
    ...(draft.ocrBlocks ? { ocrBlocks: draft.ocrBlocks } : {}),
    ocrText: draft.ocrText,
    parseResult: draft.parseResult,
    initialValues: draft.initialValues,
    ...(draft.categorySuggestion ? { categorySuggestion: draft.categorySuggestion } : {}),
    ...(draft.confidenceAssessment ? { confidenceAssessment: draft.confidenceAssessment } : {}),
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    expiresAt,
  };
}

export function restorePendingReceiptReview(
  review: PendingReceiptReview,
  createPreviewUrl: (image: Blob) => string = (image) => URL.createObjectURL(image),
): ReceiptDraft {
  const imageFile = new File([review.imageBlob], review.imageName, {
    type: review.imageType,
    lastModified: new Date(review.updatedAt).getTime(),
  });

  return {
    imageFile,
    imagePreviewUrl: createPreviewUrl(review.imageBlob),
    ...(review.ocrBlocks ? { ocrBlocks: review.ocrBlocks } : {}),
    ocrText: review.ocrText,
    parseResult: review.parseResult,
    initialValues: review.initialValues,
    ...(review.categorySuggestion ? { categorySuggestion: review.categorySuggestion } : {}),
    ...(review.confidenceAssessment ? { confidenceAssessment: review.confidenceAssessment } : {}),
    pendingReviewId: review.id,
  };
}
