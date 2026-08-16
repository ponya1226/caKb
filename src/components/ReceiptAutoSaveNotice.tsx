import { CheckCircle2, Undo2 } from "lucide-react";
import { formatReceiptRecognitionReport } from "../lib/receiptRecognitionReport";
import type { Expense } from "../types";
import { CopyTextButton } from "./CopyTextButton";

type ReceiptAutoSaveNoticeProps = {
  expense: Expense;
  error?: string | null;
  isUndoing: boolean;
  onUndo: () => void;
};

export function ReceiptAutoSaveNotice({
  expense,
  error,
  isUndoing,
  onUndo,
}: ReceiptAutoSaveNoticeProps) {
  const recognitionReport = formatReceiptRecognitionReport({
    amount: expense.amount,
    lineItems: expense.lineItems,
  });

  return (
    <div className="auto-save-banner" role="status">
      <CheckCircle2 size={20} aria-hidden="true" />
      <div>
        <strong>登録しました</strong>
        <span>{expense.shopName} / ¥{expense.amount.toLocaleString("ja-JP")}</span>
        {error && <small>{error}</small>}
      </div>
      <div className="auto-save-actions">
        <CopyTextButton text={recognitionReport} label="品目・合計" />
        <button className="button button-secondary button-compact" type="button" disabled={isUndoing} onClick={onUndo}>
          <Undo2 size={16} aria-hidden="true" />
          元に戻す
        </button>
      </div>
    </div>
  );
}
