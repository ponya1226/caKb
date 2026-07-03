import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, FileImage, Play, Send, SlidersHorizontal } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
import { runOcr } from "../lib/ocr";
import type { OcrCropRatios } from "../lib/ocr";
import { parseReceiptText } from "../lib/receiptParser";
import type { OcrProgress, ReceiptCandidate, ReceiptDraft } from "../types";

const LARGE_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_COMBINED_CROP_PERCENT = 86;
const FULL_OCR_CROP: OcrCropRatios = { top: 0, right: 0, bottom: 0, left: 0 };
const RECEIPT_BODY_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 34, left: 18 };

type ReceiptCaptureScreenProps = {
  onConfirm: (draft: ReceiptDraft) => void;
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

function getPairedCropSide(side: keyof OcrCropRatios): keyof OcrCropRatios {
  if (side === "top") {
    return "bottom";
  }

  if (side === "bottom") {
    return "top";
  }

  if (side === "left") {
    return "right";
  }

  return "left";
}

export function ReceiptCaptureScreen({ onConfirm }: ReceiptCaptureScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const transferredPreviewUrlRef = useRef<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState(toDateInputValue(new Date()));
  const [pickedShopName, setPickedShopName] = useState("");
  const [pickedAmount, setPickedAmount] = useState(0);
  const [ocrCrop, setOcrCrop] = useState<OcrCropRatios>(RECEIPT_BODY_CROP);

  const parseResult = ocrText ? parseReceiptText(ocrText) : null;

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && transferredPreviewUrlRef.current !== imagePreviewUrl) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    transferredPreviewUrlRef.current = null;
    setSelectedFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setOcrText("");
    setProgress(null);
    setError(null);
    setOcrCrop(RECEIPT_BODY_CROP);
    event.target.value = "";
  }

  function handleCropChange(side: keyof OcrCropRatios, value: number) {
    setOcrCrop((currentCrop) => {
      const pairedSide = getPairedCropSide(side);
      const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - currentCrop[pairedSide]);
      return {
        ...currentCrop,
        [side]: Math.min(value, maxValue),
      };
    });
  }

  async function handleRunOcr() {
    if (!selectedFile) {
      setError("画像を選択してください");
      return;
    }

    setIsRunning(true);
    setError(null);
    setProgress({ status: "starting", progress: 0 });

    try {
      const text = await runOcr(selectedFile, setProgress, { crop: ocrCrop });
      const parsed = parseReceiptText(text);
      setOcrText(text);
      setPickedDate(parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()));
      setPickedShopName(parsed.shopNameCandidates[0]?.value ?? "");
      setPickedAmount(parsed.amountCandidates[0]?.value ?? 0);
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

    transferredPreviewUrlRef.current = imagePreviewUrl;
    onConfirm({
      imageFile: selectedFile,
      imagePreviewUrl,
      ocrText,
      parseResult,
      initialValues: {
        date: pickedDate,
        shopName: pickedShopName,
        amount: pickedAmount,
        categoryId: DEFAULT_CATEGORY_ID,
        memo: "",
      },
    });
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
      <input ref={uploadInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleFileChange} />

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
              <button className="button button-secondary button-compact" type="button" onClick={() => setOcrCrop(RECEIPT_BODY_CROP)}>
                <SlidersHorizontal size={16} aria-hidden="true" />
                本体
              </button>
              <button className="button button-secondary button-compact" type="button" onClick={() => setOcrCrop(FULL_OCR_CROP)}>
                全体
              </button>
            </div>
          </div>
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
        <div className={selectedFile.size > LARGE_RECEIPT_IMAGE_BYTES ? "file-size-panel warning" : "file-size-panel"}>
          <div>
            <strong>{selectedFile.name}</strong>
            <span>{formatFileSize(selectedFile.size)}</span>
          </div>
          <p>選択画像の容量を確認しています。</p>
          {selectedFile.size > LARGE_RECEIPT_IMAGE_BYTES && (
            <p>画像が大きいため、OCRに時間がかかる可能性があります。</p>
          )}
        </div>
      )}

      <div className="button-row">
        <button className="button button-primary" type="button" onClick={handleRunOcr} disabled={!selectedFile || isRunning}>
          <Play size={18} aria-hidden="true" />
          {isRunning ? "OCR中" : "OCR実行"}
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
          <CandidateButtons title="店舗名候補" candidates={parseResult.shopNameCandidates} onPick={setPickedShopName} />
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
