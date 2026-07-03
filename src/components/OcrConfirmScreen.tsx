import { ArrowLeft, Save } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { ExpenseEditor } from "./ExpenseEditor";
import type { AppSettings, Category, ExpenseFormValues, ReceiptDraft } from "../types";

type OcrConfirmScreenProps = {
  draft: ReceiptDraft;
  categories: Category[];
  settings: AppSettings;
  onBack: () => void;
  onSave: (values: ExpenseFormValues) => Promise<void>;
};

export function OcrConfirmScreen({ draft, categories, settings, onBack, onSave }: OcrConfirmScreenProps) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">保存前確認</p>
          <h1>OCR確認</h1>
        </div>
        <button className="icon-button" type="button" onClick={onBack} aria-label="戻る">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="receipt-preview compact">
        <img src={draft.imagePreviewUrl} alt="確認中のレシート" />
      </div>

      <div className="save-mode">
        <Save size={18} aria-hidden="true" />
        <span>画像保存: {settings.saveReceiptImages ? "ON" : "OFF"}</span>
      </div>

      <ExpenseEditor categories={categories} initialValues={draft.initialValues} submitLabel="保存" onCancel={onBack} onSubmit={onSave} />

      <section className="content-section">
        <div className="section-title-row">
          <h2>OCR結果全文</h2>
          <CopyTextButton text={draft.ocrText} label="全文コピー" />
        </div>
        <pre className="ocr-text">{draft.ocrText}</pre>
      </section>
    </section>
  );
}
