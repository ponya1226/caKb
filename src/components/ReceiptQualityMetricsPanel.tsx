import { Trash2 } from "lucide-react";
import { formatMonthLabel } from "../lib/date";
import type {
  ReceiptQualityReviewReasonCode,
  ReceiptQualitySummary,
} from "../lib/receiptQualityMetrics";

type ReceiptQualityMetricsPanelProps = {
  summary: ReceiptQualitySummary;
  error?: string | null;
  onClear: () => boolean;
};

const REASON_LABELS = {
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

function formatRate(rate: number | null): string {
  return rate === null ? "対象なし" : `${Math.round(rate * 100)}%`;
}

export function ReceiptQualityMetricsPanel({
  summary,
  error,
  onClear,
}: ReceiptQualityMetricsPanelProps) {
  const hasMetrics = summary.processed > 0
    || summary.autoSaveUndone > 0
    || summary.reviewsSaved > 0
    || summary.reviewsDiscarded > 0;
  const reviewReasons = Object.entries(summary.reviewReasons)
    .filter((entry): entry is [ReceiptQualityReviewReasonCode, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((left, right) => right[1] - left[1]);

  function handleClear() {
    if (!window.confirm("この端末の自動登録集計を消去しますか？")) {
      return;
    }
    onClear();
  }

  return (
    <section className="content-section receipt-quality-section">
      <div className="section-title-row">
        <div>
          <h2>自動登録の確認</h2>
          <p className="subtle-text">{formatMonthLabel(summary.monthKey)}・この端末のみ</p>
        </div>
      </div>

      <p className="subtle-text">
        店舗名、金額、画像、読み取った文字は記録せず、処理件数と判定理由だけを集計します。
      </p>

      {!hasMetrics ? (
        <div className="empty-state">今月のレシート読み取りはまだありません</div>
      ) : (
        <>
          <div className="receipt-quality-list">
            <div>
              <span>読み取ったレシート</span>
              <strong>{summary.processed}件</strong>
            </div>
            <div>
              <span>自動登録</span>
              <strong>{summary.autoSaved}件 / {formatRate(summary.autoSaveRate)}</strong>
            </div>
            <div>
              <span>確認が必要</span>
              <strong>{summary.needsReview}件</strong>
            </div>
            <div>
              <span>自動登録を元に戻した割合</span>
              <strong>{summary.autoSaveUndone}件 / {formatRate(summary.undoRate)}</strong>
            </div>
            <div>
              <span>確認時に総額を直した割合</span>
              <strong>{summary.reviewTotalsCorrected}件 / {formatRate(summary.reviewTotalCorrectionRate)}</strong>
            </div>
          </div>

          {reviewReasons.length > 0 && (
            <div className="receipt-quality-reasons">
              <strong>確認になった理由</strong>
              <ul>
                {reviewReasons.map(([code, count]) => (
                  <li key={code}>
                    <span>{REASON_LABELS[code]}</span>
                    <strong>{count}件</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.reviewsDiscarded > 0 && (
            <p className="subtle-text">確認せず削除: {summary.reviewsDiscarded}件</p>
          )}
        </>
      )}

      {error && <p className="inline-error">{error}</p>}

      <button className="button button-secondary full-width" type="button" onClick={handleClear} disabled={!hasMetrics}>
        <Trash2 size={18} aria-hidden="true" />
        この端末の集計を消去
      </button>
    </section>
  );
}
