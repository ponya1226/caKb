import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Play, Save, SkipForward, SlidersHorizontal, Sparkles } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { ExpenseEditor } from "./ExpenseEditor";
import { OcrCropPreview } from "./OcrCropPreview";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import type { OcrCropRatios, OcrPreprocessMode } from "../lib/ocr";
import { getOcrProviderLabel } from "../lib/ocrProviders";
import {
  FULL_OCR_CROP,
  getOcrPresets,
  getPairedCropSide,
  MAX_COMBINED_CROP_PERCENT,
  RECEIPT_BODY_CROP,
  runOcrWithRangeMode,
} from "../lib/ocrRange";
import type { OcrMode, OcrPreset } from "../lib/ocrRange";
import { parseReceiptText } from "../lib/receiptParser";
import { toDateInputValue } from "../lib/date";
import type {
  AppSettings,
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
  onSave: (values: ExpenseFormValues, options?: ReceiptSaveOptions) => Promise<void>;
};

function normalizeOcrPreprocessMode(mode: string | undefined): OcrPreprocessMode {
  if (mode === "binary" || mode === "bold" || mode === "contrast") {
    return mode;
  }

  return "contrast";
}

function getDefaultOcrCrop(draft: ReceiptDraft, savedOcrCrop?: OcrCropRatios): OcrCropRatios {
  return draft.ocrCrop ?? (draft.ocrProvider === "googleVision" ? FULL_OCR_CROP : savedOcrCrop ?? RECEIPT_BODY_CROP);
}

function getDefaultPresetLabel(draft: ReceiptDraft): string | null {
  return draft.ocrPresetLabel ?? (draft.ocrProvider === "googleVision" ? "全体" : null);
}

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
  const [ocrCrop, setOcrCrop] = useState<OcrCropRatios>(() => getDefaultOcrCrop(draft, savedOcrCrop));
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(() => getDefaultPresetLabel(draft));
  const [ocrPreprocess, setOcrPreprocess] = useState(draft.ocrPreprocess ?? false);
  const [ocrPreprocessMode, setOcrPreprocessMode] = useState<OcrPreprocessMode>(normalizeOcrPreprocessMode(draft.ocrPreprocessMode));
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saveCategoryRule, setSaveCategoryRule] = useState(true);
  const ocrPresets = useMemo(() => getOcrPresets(savedOcrCrop), [savedOcrCrop]);
  const isDraftGoogleVision = draft.ocrProvider === "googleVision";

  const suggestedCategory = draft.categorySuggestion
    ? categories.find((category) => category.id === draft.categorySuggestion?.categoryId)
    : undefined;

  useEffect(() => {
    setOcrMode("auto");
    setOcrCrop(getDefaultOcrCrop(draft, savedOcrCrop));
    setSelectedPresetLabel(getDefaultPresetLabel(draft));
    setOcrPreprocess(draft.ocrPreprocess ?? false);
    setOcrPreprocessMode(normalizeOcrPreprocessMode(draft.ocrPreprocessMode));
    setProgress(null);
    setError(null);
    setIsRunning(false);
    setSaveCategoryRule(true);
  }, [draft.imagePreviewUrl, draft.ocrCrop, draft.ocrPresetLabel, draft.ocrPreprocess, draft.ocrPreprocessMode, draft.ocrProvider, savedOcrCrop]);

  function applyManualCrop(nextCrop: OcrCropRatios) {
    setOcrMode("manual");
    setOcrPreprocess(true);
    setOcrPreprocessMode("contrast");
    setSelectedPresetLabel("手動補正");
    setOcrCrop(nextCrop);
  }

  function handleCropChange(side: keyof OcrCropRatios, value: number) {
    setOcrMode("manual");
    setOcrPreprocess(true);
    setOcrPreprocessMode("contrast");
    setSelectedPresetLabel("手動補正");
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
    setOcrPreprocess(Boolean(preset.preprocess));
    setOcrPreprocessMode(preset.preprocessMode ?? "contrast");
    setOcrCrop(preset.crop);
  }

  function applyAutoMode() {
    const isGoogleVision = draft.ocrProvider === "googleVision";
    setOcrMode("auto");
    setSelectedPresetLabel(isGoogleVision ? "全体" : null);
    setOcrPreprocess(false);
    setOcrPreprocessMode("contrast");
    setOcrCrop(isGoogleVision ? FULL_OCR_CROP : savedOcrCrop ?? RECEIPT_BODY_CROP);
  }

  async function handleRerunOcr() {
    setIsRunning(true);
    setProgress({ status: "starting", progress: 0 });
    setError(null);

    try {
      const provider = draft.ocrProvider ?? "localTesseract";
      const isGoogleVision = provider === "googleVision";
      const ocrResult = await runOcrWithRangeMode(draft.imageFile, {
        provider,
        mode: isGoogleVision ? "manual" : ocrMode,
        crop: isGoogleVision ? FULL_OCR_CROP : ocrCrop,
        presetLabel: isGoogleVision ? "全体" : selectedPresetLabel,
        preprocess: isGoogleVision ? false : ocrPreprocess,
        preprocessMode: ocrPreprocessMode,
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
        ocrPreprocess: ocrResult.preprocess,
        ocrPreprocessMode: ocrResult.preprocessMode,
        ocrProvider: ocrResult.provider,
        ...(ocrResult.blocks ? { ocrBlocks: ocrResult.blocks } : {}),
        ...(ocrResult.ocrImagePreviewUrl ? { ocrImagePreviewUrl: ocrResult.ocrImagePreviewUrl } : {}),
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
      setOcrPreprocess(ocrResult.preprocess);
      setOcrPreprocessMode(ocrResult.preprocessMode);
      if (draft.ocrImagePreviewUrl && draft.ocrImagePreviewUrl !== ocrResult.ocrImagePreviewUrl) {
        URL.revokeObjectURL(draft.ocrImagePreviewUrl);
      }
      if (provider !== "googleVision") {
        onSaveOcrCrop(ocrResult.crop);
      }
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

      <OcrCropPreview
        imageSrc={draft.imagePreviewUrl}
        imageAlt="確認中のレシート"
        crop={ocrCrop}
        compact
        onCropChange={isDraftGoogleVision ? undefined : applyManualCrop}
      />

      <div className="save-mode">
        <Save size={18} aria-hidden="true" />
        <span>画像保存: {settings.saveReceiptImages ? "ON" : "OFF"}</span>
      </div>

      <div className="save-mode">
        <span>読み取り方式: {getOcrProviderLabel(draft.ocrProvider)}</span>
      </div>

      {suggestedCategory && (
        <div className="save-mode">
          <span>{draft.categorySuggestion?.source === "rule" ? "店舗ルールを反映" : "前回のカテゴリを反映"}: {suggestedCategory.name}</span>
        </div>
      )}

      <details className="ocr-crop-panel">
        <summary>範囲の補助設定</summary>
        <div className="section-title-row">
          <h2>このレシートを再OCR</h2>
          {!isDraftGoogleVision && (
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
          )}
        </div>
        <p className="subtle-text">
          {isDraftGoogleVision
            ? "Google Visionでは写真全体を送信して再OCRします。範囲調整はローカルOCR用の補助機能です。"
            : ocrMode === "auto"
            ? "確認中の1枚だけ複数の範囲で再OCRします。"
            : `使用範囲: ${selectedPresetLabel ?? "手動補正"}`}
        </p>
        {!isDraftGoogleVision && (
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
        )}
      </details>

      <button className="button button-primary full-width" type="button" onClick={handleRerunOcr} disabled={isRunning}>
        <Play size={18} aria-hidden="true" />
        {isRunning ? "再OCR中" : isDraftGoogleVision ? "写真全体で再OCR" : "この範囲で再OCR"}
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
          <small>保存した店舗名とカテゴリを端末内にルールとして保存します。</small>
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

      {draft.ocrImagePreviewUrl && (
        <details className="content-section ocr-debug-panel">
          <summary>補正画像を確認</summary>
          <img src={draft.ocrImagePreviewUrl} alt="OCRに渡した補正後画像" />
        </details>
      )}
    </section>
  );
}
