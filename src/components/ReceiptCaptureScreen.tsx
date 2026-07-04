import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Copy, FileImage, Play, Save, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { OcrCropPreview } from "./OcrCropPreview";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
import { detectOcrCrop, type OcrCropRatios } from "../lib/ocr";
import {
  getOcrPresets,
  getPairedCropSide,
  MAX_COMBINED_CROP_PERCENT,
  RECEIPT_BODY_CROP,
  runOcrWithRangeMode,
} from "../lib/ocrRange";
import type { OcrMode, OcrPreset, OcrRunResult } from "../lib/ocrRange";
import { parseReceiptText } from "../lib/receiptParser";
import type { OcrProgress, ReceiptCandidate, ReceiptCategorySuggestion, ReceiptDraft } from "../types";

const LARGE_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

type ReceiptCropStatus = "detecting" | "detected" | "fallback" | "manual" | "preset" | "auto";

type ReceiptSelection = {
  file: File;
  previewUrl: string;
  crop: OcrCropRatios;
  mode: OcrMode;
  presetLabel: string | null;
  preprocess: boolean;
  cropStatus: ReceiptCropStatus;
};

type ReceiptCaptureScreenProps = {
  onConfirm: (drafts: ReceiptDraft[]) => void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  savedOcrCrop?: OcrCropRatios;
  onSaveOcrCrop: (crop: OcrCropRatios) => void;
};

function CandidateButtons<T>({
  title,
  candidates,
  onPick,
}: {
  title: string;
  candidates: Array<ReceiptCandidate<T>>;
  onPick: (value: T) => void;
}) {
  return (
    <div className="candidate-group">
      <h3>{title}</h3>
      {candidates.length === 0 ? (
        <p className="subtle-text">候補なし</p>
      ) : (
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <button
              key={`${candidate.label}-${candidate.line}`}
              className="candidate-chip"
              type="button"
              onClick={() => onPick(candidate.value)}
            >
              <span>{candidate.label}</span>
              <small>{candidate.line}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReceiptCaptureScreen({ onConfirm, suggestCategoryForShop, savedOcrCrop, onSaveOcrCrop }: ReceiptCaptureScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const transferredPreviewUrlsRef = useRef<Set<string>>(new Set());
  const receiptSelectionsRef = useRef<ReceiptSelection[]>([]);
  const [receiptSelections, setReceiptSelections] = useState<ReceiptSelection[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState(toDateInputValue(new Date()));
  const [pickedShopName, setPickedShopName] = useState("");
  const [pickedAmount, setPickedAmount] = useState(0);
  const [pickedCategorySuggestion, setPickedCategorySuggestion] = useState<ReceiptCategorySuggestion | null>(null);

  const selectedReceipt = receiptSelections[selectedFileIndex] ?? null;
  const selectedFiles = receiptSelections.map((selection) => selection.file);
  const selectedFile = selectedReceipt?.file ?? null;
  const imagePreviewUrl = selectedReceipt?.previewUrl ?? null;
  const ocrMode = selectedReceipt?.mode ?? "auto";
  const ocrCrop = selectedReceipt?.crop ?? savedOcrCrop ?? RECEIPT_BODY_CROP;
  const selectedPresetLabel = selectedReceipt?.presetLabel ?? null;
  const totalFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasLargeSelectedFile = selectedFiles.some((file) => file.size > LARGE_RECEIPT_IMAGE_BYTES);
  const isDetectingCrop = receiptSelections.some((selection) => selection.cropStatus === "detecting");
  const parseResult = ocrText ? parseReceiptText(ocrText) : null;
  const ocrPresets = useMemo(() => getOcrPresets(savedOcrCrop), [savedOcrCrop]);

  useEffect(() => {
    receiptSelectionsRef.current = receiptSelections;
  }, [receiptSelections]);

  useEffect(() => {
    return () => {
      revokeSelectionUrls(receiptSelectionsRef.current);
    };
  }, []);

  function revokeSelectionUrls(selections: ReceiptSelection[]) {
    selections.forEach((selection) => {
      if (!transferredPreviewUrlsRef.current.has(selection.previewUrl)) {
        URL.revokeObjectURL(selection.previewUrl);
      }
    });
  }

  function markPreviewUrlsTransferred(selections: ReceiptSelection[]) {
    selections.forEach((selection) => {
      transferredPreviewUrlsRef.current.add(selection.previewUrl);
    });
  }

  function createReceiptSelection(file: File): ReceiptSelection {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      crop: savedOcrCrop ?? RECEIPT_BODY_CROP,
      mode: "manual",
      presetLabel: "自動検出中",
      preprocess: true,
      cropStatus: "detecting",
    };
  }

  function updateReceiptSelection(index: number, updater: (selection: ReceiptSelection) => ReceiptSelection) {
    setReceiptSelections((currentSelections) =>
      currentSelections.map((selection, selectionIndex) => (
        selectionIndex === index ? updater(selection) : selection
      )),
    );
  }

  function updateSelectedReceipt(updater: (selection: ReceiptSelection) => ReceiptSelection) {
    updateReceiptSelection(selectedFileIndex, updater);
  }

  async function detectCropForSelections(selections: ReceiptSelection[]) {
    for (const selection of selections) {
      const detectedCrop = await detectOcrCrop(selection.file).catch(() => null);
      setReceiptSelections((currentSelections) =>
        currentSelections.map((currentSelection) => {
          if (currentSelection.previewUrl !== selection.previewUrl || currentSelection.cropStatus !== "detecting") {
            return currentSelection;
          }

          if (!detectedCrop) {
            return {
              ...currentSelection,
              presetLabel: "既定補正",
              cropStatus: "fallback",
            };
          }

          return {
            ...currentSelection,
            crop: detectedCrop,
            presetLabel: "自動検出補正",
            cropStatus: "detected",
          };
        }),
      );
    }
  }

  function getCropDescription(selection: ReceiptSelection): string {
    if (selection.cropStatus === "detecting") {
      return "画像の用紙範囲を検出しています。";
    }

    if (selection.mode === "auto") {
      return "複数の範囲を試して、候補が最も揃う結果を使います。";
    }

    if (receiptSelections.length > 1) {
      return `画像ごとにOCR範囲を保持しています。使用範囲: ${selection.presetLabel ?? "手動補正"}`;
    }

    return `使用範囲: ${selection.presetLabel ?? "手動補正"}`;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    revokeSelectionUrls(receiptSelections);
    transferredPreviewUrlsRef.current = new Set();
    const nextSelections = files.map(createReceiptSelection);

    setReceiptSelections(nextSelections);
    setSelectedFileIndex(0);
    setOcrText("");
    setProgress(null);
    setError(null);
    setPickedCategorySuggestion(null);
    event.target.value = "";
    void detectCropForSelections(nextSelections);
  }

  function createDraftFromOcr(file: File, imageUrl: string, ocrResult: OcrRunResult): ReceiptDraft {
    const text = ocrResult.text;
    const parsed = parseReceiptText(text);
    const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
    const categorySuggestion = suggestCategoryForShop(initialShopName);

    return {
      imageFile: file,
      imagePreviewUrl: imageUrl,
      ocrText: text,
      parseResult: parsed,
      ocrCrop: ocrResult.crop,
      ocrPresetLabel: ocrResult.presetLabel,
      ocrPreprocess: ocrResult.preprocess,
      initialValues: {
        date: parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()),
        shopName: initialShopName,
        amount: parsed.amountCandidates[0]?.value ?? 0,
        categoryId: categorySuggestion?.categoryId ?? DEFAULT_CATEGORY_ID,
        memo: "",
      },
      ...(categorySuggestion ? { categorySuggestion } : {}),
    };
  }

  function pickShopName(shopName: string) {
    setPickedShopName(shopName);
    setPickedCategorySuggestion(suggestCategoryForShop(shopName));
  }

  function applyManualCrop(nextCrop: OcrCropRatios) {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "manual",
      preprocess: true,
      presetLabel: "手動補正",
      crop: nextCrop,
      cropStatus: "manual",
    }));
  }

  function handleCropChange(side: keyof OcrCropRatios, value: number) {
    updateSelectedReceipt((selection) => {
      const pairedSide = getPairedCropSide(side);
      const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - selection.crop[pairedSide]);
      return {
        ...selection,
        mode: "manual",
        preprocess: true,
        presetLabel: "手動補正",
        crop: {
          ...selection.crop,
          [side]: Math.min(value, maxValue),
        },
        cropStatus: "manual",
      };
    });
  }

  function applyPreset(preset: OcrPreset) {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "manual",
      presetLabel: preset.label,
      preprocess: Boolean(preset.preprocess),
      crop: preset.crop,
      cropStatus: "preset",
    }));
  }

  function applyAutoMode() {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "auto",
      presetLabel: null,
      preprocess: false,
      crop: savedOcrCrop ?? RECEIPT_BODY_CROP,
      cropStatus: "auto",
    }));
  }

  function applySelectedCropToAll() {
    if (!selectedReceipt) {
      return;
    }

    setReceiptSelections((currentSelections) =>
      currentSelections.map((selection) => ({
        ...selection,
        mode: "manual",
        presetLabel: selectedReceipt.presetLabel ?? "共通範囲補正",
        preprocess: true,
        crop: selectedReceipt.crop,
        cropStatus: "manual",
      })),
    );
  }

  async function runOcrForSelection(
    selection: ReceiptSelection,
    onProgress: (progress: OcrProgress) => void,
    forceRange = false,
  ): Promise<OcrRunResult> {
    return runOcrWithRangeMode(selection.file, {
      mode: forceRange ? "manual" : selection.mode,
      crop: selection.crop,
      presetLabel: forceRange ? selection.presetLabel ?? "選択範囲補正" : selection.presetLabel,
      preprocess: selection.preprocess,
      savedOcrCrop,
      onProgress,
    });
  }

  async function handleRunOcr() {
    if (selectedFiles.length === 0) {
      setError("画像を選択してください");
      return;
    }

    setIsRunning(true);
    setError(null);
    setProgress({ status: "starting", progress: 0 });

    try {
      if (receiptSelections.length === 1 && selectedReceipt) {
        const ocrResult = await runOcrForSelection(selectedReceipt, setProgress);
        const parsed = parseReceiptText(ocrResult.text);
        const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
        const categorySuggestion = suggestCategoryForShop(initialShopName);
        setOcrText(ocrResult.text);
        setPickedDate(parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()));
        setPickedShopName(initialShopName);
        setPickedAmount(parsed.amountCandidates[0]?.value ?? 0);
        setPickedCategorySuggestion(categorySuggestion);
        updateReceiptSelection(selectedFileIndex, (selection) => ({
          ...selection,
          crop: ocrResult.crop,
          presetLabel: ocrResult.presetLabel,
          preprocess: ocrResult.preprocess,
          cropStatus: ocrResult.presetLabel === "自動" ? "auto" : selection.cropStatus,
        }));
        onSaveOcrCrop(ocrResult.crop);
        return;
      }

      const ocrResults: Array<{ selection: ReceiptSelection; result: OcrRunResult }> = [];
      for (const [index, selection] of receiptSelections.entries()) {
        const ocrResult = await runOcrForSelection(
          selection,
          (nextProgress) => {
            setProgress({
              status: `${index + 1}/${receiptSelections.length} ${nextProgress.status}`,
              progress: (index + nextProgress.progress) / receiptSelections.length,
            });
          },
          true,
        );
        ocrResults.push({ selection, result: ocrResult });
      }

      const drafts = ocrResults.map(({ selection, result }) =>
        createDraftFromOcr(selection.file, selection.previewUrl, result),
      );

      markPreviewUrlsTransferred(receiptSelections);
      onConfirm(drafts);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "OCRに失敗しました");
    } finally {
      setIsRunning(false);
    }
  }

  function handleConfirm() {
    if (!selectedReceipt || !parseResult) {
      return;
    }

    const categorySuggestion = suggestCategoryForShop(pickedShopName) ?? pickedCategorySuggestion;
    markPreviewUrlsTransferred([selectedReceipt]);
    onConfirm([{
      imageFile: selectedReceipt.file,
      imagePreviewUrl: selectedReceipt.previewUrl,
      ocrText,
      parseResult,
      ocrCrop: selectedReceipt.crop,
      ocrPresetLabel: selectedReceipt.presetLabel ?? undefined,
      ocrPreprocess: selectedReceipt.preprocess,
      initialValues: {
        date: pickedDate,
        shopName: pickedShopName,
        amount: pickedAmount,
        categoryId: categorySuggestion?.categoryId ?? DEFAULT_CATEGORY_ID,
        memo: "",
      },
      ...(categorySuggestion ? { categorySuggestion } : {}),
    }]);
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">OCR</p>
          <h1>レシート登録</h1>
        </div>
      </div>

      <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
      <input ref={uploadInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={handleFileChange} />

      <div className="capture-actions">
        <button className="button button-primary" type="button" onClick={() => cameraInputRef.current?.click()}>
          <Camera size={19} aria-hidden="true" />
          撮影
        </button>
        <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>
          <FileImage size={19} aria-hidden="true" />
          アップロード
        </button>
      </div>

      {receiptSelections.length > 1 && (
        <div className="receipt-selection-strip" aria-label="選択画像">
          {receiptSelections.map((selection, index) => (
            <button
              className={index === selectedFileIndex ? "receipt-selection-chip active" : "receipt-selection-chip"}
              key={selection.previewUrl}
              type="button"
              onClick={() => setSelectedFileIndex(index)}
            >
              <img src={selection.previewUrl} alt={`${index + 1}枚目のレシート`} />
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      )}

      {imagePreviewUrl && (
        <OcrCropPreview
          imageSrc={imagePreviewUrl}
          imageAlt="選択したレシート"
          crop={ocrCrop}
          onCropChange={applyManualCrop}
        />
      )}

      {selectedFile && (
        <details className="ocr-crop-panel">
          <summary>範囲の補助設定</summary>
          <div className="section-title-row">
            <h2>OCR範囲</h2>
            <div className="preset-actions">
              <button className={ocrMode === "auto" ? "button button-primary button-compact" : "button button-secondary button-compact"} type="button" onClick={applyAutoMode}>
                <Sparkles size={16} aria-hidden="true" />
                自動
              </button>
              {receiptSelections.length > 1 && (
                <button className="button button-secondary button-compact" type="button" onClick={applySelectedCropToAll}>
                  <Copy size={16} aria-hidden="true" />
                  全画像に適用
                </button>
              )}
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
            {selectedReceipt ? getCropDescription(selectedReceipt) : ""}
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
        </details>
      )}

      {selectedFile && (
        <div className={hasLargeSelectedFile ? "file-size-panel warning" : "file-size-panel"}>
          <div>
            <strong>{selectedFiles.length === 1 ? selectedFile.name : `${selectedFiles.length}枚選択`}</strong>
            <span>{formatFileSize(totalFileSize)}</span>
          </div>
          <p>{selectedFiles.length === 1 ? "選択画像の容量を確認しています。" : "複数画像を順番にOCRします。"}</p>
          {hasLargeSelectedFile && (
            <p>画像が大きいため、OCRに時間がかかる可能性があります。</p>
          )}
        </div>
      )}

      <div className="button-row">
        <button className="button button-primary" type="button" onClick={handleRunOcr} disabled={!selectedFile || isRunning || isDetectingCrop}>
          <Play size={18} aria-hidden="true" />
          {isDetectingCrop ? "範囲検出中" : isRunning ? "OCR中" : selectedFiles.length > 1 ? "一括OCR実行" : "OCR実行"}
        </button>
      </div>

      {progress && (
        <div className="progress-box">
          <div className="progress-track">
            <span style={{ width: `${Math.max(4, Math.round(progress.progress * 100))}%` }} />
          </div>
          <small>{progress.status}</small>
        </div>
      )}

      {error && <p className="inline-error">{error}</p>}

      {parseResult && (
        <div className="candidate-panel">
          <CandidateButtons title="日付候補" candidates={parseResult.dateCandidates} onPick={setPickedDate} />
          <CandidateButtons title="店舗名候補" candidates={parseResult.shopNameCandidates} onPick={pickShopName} />
          <CandidateButtons title="金額候補" candidates={parseResult.amountCandidates} onPick={setPickedAmount} />
          <div className="picked-summary">
            <span>{pickedDate}</span>
            <span>{pickedShopName || "店舗名未選択"}</span>
            <strong>¥{pickedAmount.toLocaleString("ja-JP")}</strong>
          </div>
          <button className="button button-primary full-width" type="button" onClick={handleConfirm}>
            <Send size={18} aria-hidden="true" />
            確認へ
          </button>
        </div>
      )}

      {ocrText && (
        <section className="content-section">
          <div className="section-title-row">
            <h2>OCR結果全文</h2>
            <CopyTextButton text={ocrText} label="全文コピー" />
          </div>
          <pre className="ocr-text">{ocrText}</pre>
        </section>
      )}
    </section>
  );
}
