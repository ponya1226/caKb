import { useEffect, useState } from "react";
import { ArrowLeft, CircleAlert, Play, SkipForward, Trash2 } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { ExpenseEditor } from "./ExpenseEditor";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { assessReceiptConfidence } from "../lib/receiptConfidence";
import { createLineItemsFromCandidates } from "../lib/lineItems";
import { runReceiptOcr } from "../lib/receiptOcr";
import { parseReceiptText } from "../lib/receiptParser";
import { toDateInputValue } from "../lib/date";
import type {
  Category,
  ExpenseFormValues,
  OcrProgress,
  ReceiptCategorySuggestion,
  ReceiptDraft,
  ReceiptSaveOptions,
} from "../types";

type OcrConfirmScreenProps = {
  draft: ReceiptDraft;
  categories: Category[];
  queuePosition?: {
    current: number;
    total: number;
  };
  onBack: () => void;
  onSkip?: () => void;
  onDiscard?: () => Promise<void> | void;
  onUpdateDraft: (draft: ReceiptDraft) => Promise<void> | void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  getGoogleVisionIdToken: () => Promise<string | null>;
  onSave: (values: ExpenseFormValues, options?: ReceiptSaveOptions) => Promise<void>;
};

export function OcrConfirmScreen({
  draft,
  categories,
  queuePosition,
  onBack,
  onSkip,
  onDiscard,
  onUpdateDraft,
  suggestCategoryForShop,
  getGoogleVisionIdToken,
  onSave,
}: OcrConfirmScreenProps) {
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saveCategoryRule, setSaveCategoryRule] = useState(true);

  const suggestedCategory = draft.categorySuggestion
    ? categories.find((category) => category.id === draft.categorySuggestion?.categoryId)
    : undefined;

  useEffect(() => {
    setProgress(null);
    setError(null);
    setIsRunning(false);
    setSaveCategoryRule(true);
  }, [draft.imagePreviewUrl]);

  async function handleRerunOcr() {
    setIsRunning(true);
    setProgress({ status: "読み取りを準備中", progress: 0 });
    setError(null);

    try {
      const googleVisionAuthToken = await getGoogleVisionIdToken();
      if (!googleVisionAuthToken) {
        throw new Error("読み直すにはGoogleログインが必要です。アカウント画面でログインしてください。");
      }

      const ocrResult = await runReceiptOcr(draft.imageFile, {
        authToken: googleVisionAuthToken,
        onProgress: setProgress,
      });
      const parsed = parseReceiptText(ocrResult.text, ocrResult.blocks);
      const shopName = parsed.shopNameCandidates[0]?.value ?? draft.initialValues.shopName;
      const categorySuggestion = suggestCategoryForShop(shopName);
      const nextDraft: ReceiptDraft = {
        ...draft,
        ocrText: ocrResult.text,
        parseResult: parsed,
        ocrBlocks: ocrResult.blocks ?? [],
        initialValues: {
          ...draft.initialValues,
          date: parsed.dateCandidates[0]?.value ?? draft.initialValues.date ?? toDateInputValue(new Date()),
          shopName,
          amount: parsed.amountCandidates[0]?.value ?? draft.initialValues.amount,
          categoryId: categorySuggestion?.categoryId ?? draft.initialValues.categoryId ?? DEFAULT_CATEGORY_ID,
          lineItems: createLineItemsFromCandidates(parsed.lineItemCandidates),
        },
        categorySuggestion: categorySuggestion ?? undefined,
        confidenceAssessment: assessReceiptConfidence({
          ocrText: ocrResult.text,
          parseResult: parsed,
          categorySuggestion: categorySuggestion ?? undefined,
        }),
      };

      await onUpdateDraft(nextDraft);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "レシートを読み取れませんでした");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">
            {queuePosition && queuePosition.total > 1
              ? `要確認 ${queuePosition.current}/${queuePosition.total}`
              : "要確認"}
          </p>
          <h1>読み取り結果の確認</h1>
        </div>
        <button className="icon-button" type="button" onClick={onBack} aria-label="戻る">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      </div>

      {draft.confidenceAssessment?.decision === "needsReview" && (
        <div className="review-required-notice" role="status">
          <CircleAlert size={20} aria-hidden="true" />
          <div>
            <strong>確認が必要なレシートです</strong>
            <ul>
              {draft.confidenceAssessment.reasons.map((reason) => (
                <li key={reason.code}>{reason.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="receipt-preview compact">
        <img src={draft.imagePreviewUrl} alt="確認中のレシート" />
      </div>

      {suggestedCategory && (
        <div className="save-mode">
          <span>{draft.categorySuggestion?.source === "rule" ? "店舗ルールを反映" : "前回のカテゴリを反映"}: {suggestedCategory.name}</span>
        </div>
      )}

      <button className="button button-secondary full-width" type="button" onClick={handleRerunOcr} disabled={isRunning}>
        <Play size={18} aria-hidden="true" />
        {isRunning ? "読み直し中" : "もう一度読み取る"}
      </button>

      {progress && (
        <div className="progress-box">
          <div className="progress-track">
            <span style={{ width: `${Math.max(4, Math.round(progress.progress * 100))}%` }} />
          </div>
          <small>{progress.status}</small>
        </div>
      )}
      {error && <p className="inline-error">{error}</p>}

      <label className="rule-toggle">
        <input
          type="checkbox"
          checked={saveCategoryRule}
          onChange={(event) => setSaveCategoryRule(event.target.checked)}
        />
        <span>
          <strong>この店舗のカテゴリを次回も使う</strong>
          <small>店舗名とカテゴリをこの家計簿に保存します。</small>
        </span>
      </label>

      <ExpenseEditor
        key={`${draft.imagePreviewUrl}-${draft.ocrText}`}
        categories={categories}
        initialValues={draft.initialValues}
        submitLabel="保存"
        onCancel={onBack}
        onSubmit={(values) => onSave(values, { saveCategoryRule })}
      />

      {onDiscard && (
        <button className="button button-danger full-width" type="button" onClick={() => void onDiscard()}>
          <Trash2 size={18} aria-hidden="true" />
          この読み取りを削除
        </button>
      )}

      {onSkip && (
        <button className="button button-secondary full-width" type="button" onClick={onSkip}>
          <SkipForward size={18} aria-hidden="true" />
          このレシートをスキップ
        </button>
      )}

      <section className="content-section">
        <div className="section-title-row">
          <h2>読み取った文字</h2>
          <CopyTextButton text={draft.ocrText} label="全文コピー" />
        </div>
        <pre className="ocr-text">{draft.ocrText}</pre>
      </section>
    </section>
  );
}
