import { Trash2 } from "lucide-react";
import { formatMonthLabel } from "../lib/date";
import {
  LEGACY_RECEIPT_QUALITY_POLICY_VERSION,
  RECEIPT_QUALITY_REVIEW_REASON_LABELS,
  type ReceiptQualityReviewReasonCode,
  type ReceiptQualitySummary,
} from "../lib/receiptQualityMetrics";
import { CopyTextButton } from "./CopyTextButton";

type ReceiptQualityMetricsPanelProps = {
  selectedMonthKey: string;
  monthKeys: string[];
  summary: ReceiptQualitySummary;
  reportText: string;
  error?: string | null;
  onMonthChange: (monthKey: string) => void;
  onClear?: () => boolean;
};

function formatRate(rate: number | null): string {
  return rate === null ? "対象なし" : `${Math.round(rate * 100)}%`;
}

function formatPolicyLabel(policyVersion: string): string {
  return policyVersion === LEGACY_RECEIPT_QUALITY_POLICY_VERSION
    ? "旧形式（判定ルール記録なし）"
    : policyVersion;
}

export function ReceiptQualityMetricsPanel({
  selectedMonthKey,
  monthKeys,
  summary,
  reportText,
  error,
  onMonthChange,
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
    if (!onClear || !window.confirm("この端末の自動登録集計を消去しますか？")) {
      return;
    }
    onClear();
  }

  return (
    <section className="content-section receipt-quality-section">
      <div className="section-title-row">
        <div>
          <h2>自動登録の記録</h2>
          <p className="subtle-text">この端末のみ</p>
        </div>
      </div>

      <p className="subtle-text">
        店舗名、金額、画像、読み取った文字は記録せず、処理件数と判定理由だけを集計します。
      </p>

      <label className="field receipt-quality-month-field">
        <span>表示する月</span>
        <select value={selectedMonthKey} onChange={(event) => onMonthChange(event.target.value)}>
          {monthKeys.map((monthKey) => (
            <option key={monthKey} value={monthKey}>{formatMonthLabel(monthKey)}</option>
          ))}
        </select>
      </label>

      {!hasMetrics ? (
        <div className="empty-state">{formatMonthLabel(summary.monthKey)}のレシート読み取りはありません</div>
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
                    <span>{RECEIPT_QUALITY_REVIEW_REASON_LABELS[code]}</span>
                    <strong>{count}件</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.policySummaries.length > 0 && (
            <details className="receipt-quality-policy-details">
              <summary>判定ルール別の内訳</summary>
              <ul>
                {summary.policySummaries.map((policy) => (
                  <li key={policy.policyVersion}>
                    <strong>{formatPolicyLabel(policy.policyVersion)}</strong>
                    <span>読み取り{policy.processed}件 / 自動登録{policy.autoSaved}件 / 要確認{policy.needsReview}件</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {summary.reviewsDiscarded > 0 && (
            <p className="subtle-text">確認せず削除: {summary.reviewsDiscarded}件</p>
          )}
        </>
      )}

      {error && <p className="inline-error">{error}</p>}

      <CopyTextButton text={hasMetrics ? reportText : ""} label="集計をコピー" />

      {onClear && (
        <button className="button button-secondary full-width" type="button" onClick={handleClear} disabled={!hasMetrics}>
          <Trash2 size={18} aria-hidden="true" />
          この端末の集計を消去
        </button>
      )}
    </section>
  );
}
