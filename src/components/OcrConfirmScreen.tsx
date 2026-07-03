import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Save, SkipForward, SlidersHorizontal, Sparkles } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { ExpenseEditor } from "./ExpenseEditor";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import type { OcrCropRatios } from "../lib/ocr";
import {
  getOcrPresets,
  getPairedCropSide,
  MAX_COMBINED_CROP_PERCENT,
  RECEIPT_BODY_CROP,
  runOcrWithRangeMode,
} from "../lib/ocrRange";
import type { OcrMode, OcrPreset } from "../lib/ocrRange";
import { parseReceiptText } from "../lib/receiptParser";
import { toDateInputValue } from "../lib/date";
import type { AppSettings, Category, ExpenseFormValues, OcrProgress, ReceiptCategorySuggestion, ReceiptDraft } from "../types";

type OcrConfirmScreenProps = {
  draft: ReceiptDraft;
  categories: Category[];
  settings: AppSettings;
  queuePosition?: {
    current: number;
    total: number;
  };
  onBack: () => void;
  onSkip?: () => void;
  savedOcrCrop?: OcrCropRatios;
  onSaveOcrCrop: (crop: OcrCropRatios) => void;
  onUpdateDraft: (draft: ReceiptDraft) => void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  onSave: (values: ExpenseFormValues) => Promise<void>;
};

export function OcrConfirmScreen({
  draft,
  categories,
  settings,
  queuePosition,
  onBack,
  onSkip,
  savedOcrCrop,
  onSaveOcrCrop,
  onUpdateDraft,
  suggestCategoryForShop,
  onSave,
}: OcrConfirmScreenProps) {
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");
  const [ocrCrop, setOcrCrop] = useState<OcrCropRatios>(draft.ocrCrop ?? savedOcrCrop ?? RECEIPT_BODY_CROP);
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(draft.ocrPresetLabel ?? null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const ocrPresets = useMemo(() => getOcrPresets(savedOcrCrop), [savedOcrCrop]);

  const suggestedCategory = draft.categorySuggestion
    ? categories.find((category) => category.id === draft.categorySuggestion?.categoryId)
    : undefined;

  useEffect(() => {
    setOcrMode("auto");
    setOcrCrop(draft.ocrCrop ?? savedOcrCrop ?? RECEIPT_BODY_CROP);
    setSelectedPresetLabel(draft.ocrPresetLabel ?? null);
    setProgress(null);
    setError(null);
    setIsRunning(false);
  }, [draft.imagePreviewUrl, draft.ocrCrop, draft.ocrPresetLabel, savedOcrCrop]);

  function handleCropChange(side: keyof OcrCropRatios, value: number) {
    setOcrMode("manual");
    setSelectedPresetLabel("手動");
    setOcrCrop((currentCrop) => {
      const pairedSide = getPairedCropSide(side);
      const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - currentCrop[pairedSide]);
      return {
        ...currentCrop,
        [side]: Math.min(value, maxValue),
      };
    });
  }

  function applyPreset(preset: OcrPreset) {
    setOcrMode("manual");
    setSelectedPresetLabel(preset.label);
    setOcrCrop(preset.crop);
  }

  function applyAutoMode() {
    setOcrMode("auto");
    setSelectedPresetLabel(null);
    setOcrCrop(savedOcrCrop ?? RECEIPT_BODY_CROP);
  }

  async function handleRerunOcr() {
    setIsRunning(true);
    setProgress({ status: "starting", progress: 0 });
    setError(null);

    try {
      const ocrResult = await runOcrWithRangeMode(draft.imageFile, {
        mode: ocrMode,
        crop: ocrCrop,
        presetLabel: selectedPresetLabel,
        savedOcrCrop,
        onProgress: setProgress,
      });
      const parsed = parseReceiptText(ocrResult.text);
      const shopName = parsed.shopNameCandidates[0]?.value ?? draft.initialValues.shopName;
      const categorySuggestion = suggestCategoryForShop(shopName);
      const nextDraft: ReceiptDraft = {
        ...draft,
        ocrText: ocrResult.text,
        parseResult: parsed,
        ocrCrop: ocrResult.crop,
        ocrPresetLabel: ocrResult.presetLabel,
        initialValues: {
          ...draft.initialValues,
          date: parsed.dateCandidates[0]?.value ?? draft.initialValues.date ?? toDateInputValue(new Date()),
          shopName,
          amount: parsed.amountCandidates[0]?.value ?? draft.initialValues.amount,
          categoryId: categorySuggestion?.categoryId ?? draft.initialValues.categoryId ?? DEFAULT_CATEGORY_ID,
        },
        categorySuggestion: categorySuggestion ?? undefined,
      };

      setOcrCrop(ocrResult.crop);
      setSelectedPresetLabel(ocrResult.presetLabel);
      onSaveOcrCrop(ocrResult.crop);
      onUpdateDraft(nextDraft);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "OCRに失敗しました");
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
              ? `保存前確認 ${queuePosition.current}/${queuePosition.total}`
              : "保存前確認"}
          </p>
          <h1>OCR確認</h1>
        </div>
        <button className="icon-button" type="button" onClick={onBack} aria-label="戻る">
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="receipt-preview compact crop-preview">
        <img src={draft.imagePreviewUrl} alt="確認中のレシート" />
        <span
          className="ocr-crop-frame"
          style={{
            top: `${ocrCrop.top}%`,
            right: `${ocrCrop.right}%`,
            bottom: `${ocrCrop.bottom}%`,
            left: `${ocrCrop.left}%`,
          }}
        />
      </div>

      <div className="save-mode">
        <Save size={18} aria-hidden="true" />
        <span>画像保存: {settings.saveReceiptImages ? "ON" : "OFF"}</span>
      </div>

      {suggestedCategory && (
        <div className="save-mode">
          <span>前回のカテゴリを反映: {suggestedCategory.name}</span>
        </div>
      )}

      <section className="ocr-crop-panel">
        <div className="section-title-row">
          <h2>このレシートを再OCR</h2>
          <div className="preset-actions">
            <button className={ocrMode === "auto" ? "button button-primary button-compact" : "button button-secondary button-compact"} type="button" onClick={applyAutoMode}>
              <Sparkles size={16} aria-hidden="true" />
              自動
            </button>
            {ocrPresets.map((preset) => (
              <button
                className={
                  ocrMode === "manual" && selectedPresetLabel === preset.label
                    ? "button button-primary button-compact"
                    : "button button-secondary button-compact"
                }
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {preset.id === "body" && <SlidersHorizontal size={16} aria-hidden="true" />}
                {preset.label}
              </button>
            ))}
            <button className="button button-secondary button-compact" type="button" onClick={() => onSaveOcrCrop(ocrCrop)}>
              <Save size={16} aria-hidden="true" />
              既定にする
            </button>
          </div>
        </div>
        <p className="subtle-text">
          {ocrMode === "auto"
            ? "確認中の1枚だけ複数の範囲で再OCRします。"
            : `使用範囲: ${selectedPresetLabel ?? "手動"}`}
        </p>
        <div className="crop-control-grid">
          {[
            ["上", "top"],
            ["下", "bottom"],
            ["左", "left"],
            ["右", "right"],
          ].map(([label, side]) => {
            const cropSide = side as keyof OcrCropRatios;
            const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - ocrCrop[getPairedCropSide(cropSide)]);
            return (
              <label className="range-field" key={side}>
                <span>
                  {label} {ocrCrop[cropSide]}%
                </span>
                <input
                  type="range"
                  min="0"
                  max={maxValue}
                  step="1"
                  value={ocrCrop[cropSide]}
                  onChange={(event) => handleCropChange(cropSide, Number(event.target.value))}
                />
              </label>
            );
          })}
        </div>
        <button className="button button-primary full-width" type="button" onClick={handleRerunOcr} disabled={isRunning}>
          <Play size={18} aria-hidden="true" />
          {isRunning ? "再OCR中" : "この範囲で再OCR"}
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
      </section>

      <ExpenseEditor
        key={`${draft.imagePreviewUrl}-${draft.ocrText}`}
        categories={categories}
        initialValues={draft.initialValues}
        submitLabel="保存"
        onCancel={onBack}
        onSubmit={onSave}
      />

      {onSkip && (
        <button className="button button-secondary full-width" type="button" onClick={onSkip}>
          <SkipForward size={18} aria-hidden="true" />
          このレシートをスキップ
        </button>
      )}

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
