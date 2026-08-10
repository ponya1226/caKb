import { useCallback, useEffect, useState } from "react";
import type { PendingReceiptReview, ReceiptDraft } from "../types";
import {
  clearPendingReceiptReviews,
  deleteExpiredPendingReceiptReviews,
  deletePendingReceiptReviews,
  getPendingReceiptReviews,
  savePendingReceiptReviews,
} from "../lib/db";
import { createId } from "../lib/id";
import { createPendingReceiptReview, restorePendingReceiptReview } from "../lib/pendingReceiptReview";

function sortReviews(reviews: PendingReceiptReview[]): PendingReceiptReview[] {
  return [...reviews].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function usePendingReceiptReviews(scopeKey: string | null) {
  const [reviews, setReviews] = useState<PendingReceiptReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (!scopeKey) {
      setReviews([]);
      setIsLoading(false);
      return;
    }
    try {
      await deleteExpiredPendingReceiptReviews();
      setReviews(await getPendingReceiptReviews(scopeKey));
    } catch {
      setError("確認が必要なレシートをこの端末から読み込めませんでした");
    } finally {
      setIsLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const nextExpiry = reviews.reduce<number | null>((earliest, review) => {
      const expiresAt = Date.parse(review.expiresAt);
      if (!Number.isFinite(expiresAt)) {
        return earliest;
      }
      return earliest === null ? expiresAt : Math.min(earliest, expiresAt);
    }, null);
    if (nextExpiry === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => void refresh(), Math.max(0, nextExpiry - Date.now() + 50));
    return () => window.clearTimeout(timeoutId);
  }, [refresh, reviews]);

  const persistDrafts = useCallback(async (drafts: ReceiptDraft[]): Promise<ReceiptDraft[]> => {
    if (!scopeKey) {
      setError("家計簿を確認できないため、確認内容を一時保存できませんでした");
      throw new Error("家計簿を確認できないため、確認内容を一時保存できませんでした");
    }
    const existingById = new Map(reviews.map((review) => [review.id, review]));
    const nextDrafts = drafts.map((draft) => ({
      ...draft,
      pendingReviewId: draft.pendingReviewId ?? createId("pending_receipt"),
    }));
    const nextReviews = nextDrafts.map((draft) => createPendingReceiptReview(
      draft,
      scopeKey,
      draft.pendingReviewId ? existingById.get(draft.pendingReviewId) : undefined,
    ));

    try {
      await savePendingReceiptReviews(nextReviews);
      setReviews((current) => {
        const merged = new Map(current.map((review) => [review.id, review]));
        nextReviews.forEach((review) => merged.set(review.id, review));
        return sortReviews([...merged.values()]);
      });
      setError(null);
      return nextDrafts;
    } catch {
      setError("確認内容をこの端末に一時保存できませんでした");
      throw new Error("確認内容をこの端末に一時保存できませんでした");
    }
  }, [reviews, scopeKey]);

  const removeReviews = useCallback(async (ids: string[]) => {
    try {
      await deletePendingReceiptReviews(ids);
      setReviews((current) => current.filter((review) => !ids.includes(review.id)));
      setError(null);
    } catch {
      setError("確認が必要なレシートを削除できませんでした");
      throw new Error("確認が必要なレシートを削除できませんでした");
    }
  }, []);

  const clearReviews = useCallback(async () => {
    if (!scopeKey) {
      setReviews([]);
      return;
    }
    try {
      await clearPendingReceiptReviews(scopeKey);
      setReviews([]);
      setError(null);
    } catch {
      setError("確認が必要なレシートを削除できませんでした");
      throw new Error("確認が必要なレシートを削除できませんでした");
    }
  }, [scopeKey]);

  const restoreDrafts = useCallback(() => reviews.map((review) => restorePendingReceiptReview(review)), [reviews]);

  return {
    reviews,
    count: reviews.length,
    isLoading,
    error,
    refresh,
    persistDrafts,
    removeReviews,
    clearReviews,
    restoreDrafts,
  };
}
