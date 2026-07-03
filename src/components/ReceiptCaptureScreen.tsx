import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileImage, Play, Save, Send, SlidersHorizontal, Sparkles } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
import type { OcrCropRatios } from "../lib/ocr";
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
  const transferredPreviewUrlRef = useRef<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState(toDateInputValue(new Date()));
  const [pickedShopName, setPickedShopName] = useState("");
  const [pickedAmount, setPickedAmount] = useState(0);
  const [pickedCategorySuggestion, setPickedCategorySuggestion] = useState<ReceiptCategorySuggestion | null>(null);
  const [ocrMode, setOcrMode] = useState<OcrMode>("auto");
  const [ocrCrop, setOcrCrop] = useState<OcrCropRatios>(savedOcrCrop ?? RECEIPT_BODY_CROP);
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(null);

  const selectedFile = selectedFiles[0] ?? null;
  const totalFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasLargeSelectedFile = selectedFiles.some((file) => file.size > LARGE_RECEIPT_IMAGE_BYTES);
  const parseResult = ocrText ? parseReceiptText(ocrText) : null;
  const ocrPresets = useMemo(() => getOcrPresets(savedOcrCrop), [savedOcrCrop]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && transferredPreviewUrlRef.current !== imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    transferredPreviewUrlRef.current = null;
    setSelectedFiles(files);
    setImagePreviewUrl(URL.createObjectURL(files[0]));
    setOcrText("");
    setProgress(null);
    setError(null);
    setPickedCategorySuggestion(null);
    setOcrMode("auto");
    setOcrCrop(savedOcrCrop ?? RECEIPT_BODY_CROP);
    setSelectedPresetLabel(null);
    event.target.value = "";
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

  async function runOcrWithCurrentMode(
    file: File,
    onProgress: (progress: OcrProgress) => void,
  ): Promise<OcrRunResult> {
    return runOcrWithRangeMode(file, {
      mode: ocrMode,
      crop: ocrCrop,
      presetLabel: selectedPresetLabel,
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
      if (selectedFiles.length === 1 && selectedFile) {
        const ocrResult = await runOcrWithCurrentMode(selectedFile, setProgress);
        const parsed = parseReceiptText(ocrResult.text);
        const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
        const categorySuggestion = suggestCategoryForShop(initialShopName);
        setOcrText(ocrResult.text);
        setPickedDate(parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()));
        setPickedShopName(initialShopName);
        setPickedAmount(parsed.amountCandidates[0]?.value ?? 0);
        setPickedCategorySuggestion(categorySuggestion);
        setOcrCrop(ocrResult.crop);
        setSelectedPresetLabel(ocrResult.presetLabel);
        onSaveOcrCrop(ocrResult.crop);
        return;
      }

      const ocrResults: Array<{ file: File; result: OcrRunResult }> = [];
      for (const [index, file] of selectedFiles.entries()) {
        const ocrResult = await runOcrWithCurrentMode(
          file,
          (nextProgress) => {
            setProgress({
              status: `${index + 1}/${selectedFiles.length} ${nextProgress.status}`,
              progress: (index + nextProgress.progress) / selectedFiles.length,
            });
          },
        );
        ocrResults.push({ file, result: ocrResult });
        setOcrCrop(ocrResult.crop);
        setSelectedPresetLabel(ocrResult.presetLabel);
        onSaveOcrCrop(ocrResult.crop);
      }

      const drafts = ocrResults.map(({ file, result }, index) => {
        const imageUrl = index === 0 && imagePreviewUrl ? imagePreviewUrl : URL.createObjectURL(file);
        return createDraftFromOcr(file, imageUrl, result);
      });

      if (imagePreviewUrl) {
        transferredPreviewUrlRef.current = imagePreviewUrl;
      }
      onConfirm(drafts);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "OCRに失敗しました");
    } finally {
      setIsRunning(false);
    }
  }

  function handleConfirm() {
    if (!selectedFile || !imagePreviewUrl || !parseResult) {
      return;
    }

    const categorySuggestion = suggestCategoryForShop(pickedShopName) ?? pickedCategorySuggestion;
    transferredPreviewUrlRef.current = imagePreviewUrl;
    onConfirm([{
      imageFile: selectedFile,
      imagePreviewUrl,
      ocrText,
      parseResult,
      ocrCrop,
      ocrPresetLabel: selectedPresetLabel ?? undefined,
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

      {imagePreviewUrl && (
        <div className="receipt-preview crop-preview">
          <img src={imagePreviewUrl} alt="選択したレシート" />
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
      )}

      {selectedFile && (
        <section className="ocr-crop-panel">
          <div className="section-title-row">
            <h2>OCR範囲</h2>
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
              ? "複数の範囲を試して、候補が最も揃う結果を使います。"
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
        </section>
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
        <button className="button button-primary" type="button" onClick={handleRunOcr} disabled={!selectedFile || isRunning}>
          <Play size={18} aria-hidden="true" />
          {isRunning ? "OCR中" : selectedFiles.length > 1 ? "一括OCR実行" : "OCR実行"}
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
