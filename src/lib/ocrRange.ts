import type { OcrProgress } from "../types";
import { runOcr } from "./ocr";
import type { OcrCropRatios } from "./ocr";
import { BOTTOMLESS_OCR_CROP, FULL_OCR_CROP, RECEIPT_BODY_CROP } from "./ocrCrop";
import { parseReceiptText, scoreReceiptParseResult } from "./receiptParser";

export {
  BOTTOMLESS_OCR_CROP,
  FULL_OCR_CROP,
  getPairedCropSide,
  MAX_COMBINED_CROP_PERCENT,
  RECEIPT_BODY_CROP,
} from "./ocrCrop";

export type OcrMode = "auto" | "manual";

export type OcrPreset = {
  id: string;
  label: string;
  crop: OcrCropRatios;
  preprocess?: boolean;
};

export type OcrRunResult = {
  text: string;
  crop: OcrCropRatios;
  presetLabel: string;
  preprocess: boolean;
  score: number;
};

type RunOcrWithRangeModeOptions = {
  mode: OcrMode;
  crop: OcrCropRatios;
  presetLabel: string | null;
  preprocess?: boolean;
  savedOcrCrop?: OcrCropRatios;
  onProgress: (progress: OcrProgress) => void;
};

export function isSameCrop(first: OcrCropRatios, second: OcrCropRatios): boolean {
  return first.top === second.top && first.right === second.right && first.bottom === second.bottom && first.left === second.left;
}

function getBaseOcrPresets(): OcrPreset[] {
  return [
    { id: "document", label: "用紙補正", crop: FULL_OCR_CROP, preprocess: true },
    { id: "document-body", label: "本体補正", crop: RECEIPT_BODY_CROP, preprocess: true },
    { id: "document-bottomless", label: "下部除外補正", crop: BOTTOMLESS_OCR_CROP, preprocess: true },
    { id: "body", label: "本体", crop: RECEIPT_BODY_CROP },
    { id: "full", label: "全体", crop: FULL_OCR_CROP },
  ];
}

export function getOcrPresets(savedOcrCrop?: OcrCropRatios): OcrPreset[] {
  const presets = getBaseOcrPresets();

  if (savedOcrCrop && presets.every((preset) => !isSameCrop(preset.crop, savedOcrCrop))) {
    return [
      { id: "last-document", label: "前回補正", crop: savedOcrCrop, preprocess: true },
      { id: "last", label: "前回", crop: savedOcrCrop },
      ...presets,
    ];
  }

  return presets;
}

function scoreOcrTextQuality(text: string, preprocess: boolean): number {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const excessiveLinePenalty = Math.min(0.18, Math.max(0, lines.length - 42) * 0.01);
  const excessiveCharPenalty = Math.min(0.18, Math.max(0, text.length - 1800) / 9000);
  const preprocessBonus = preprocess ? 0.03 : 0;

  return preprocessBonus - excessiveLinePenalty - excessiveCharPenalty;
}

async function runSingleOcr(
  image: File | Blob,
  crop: OcrCropRatios,
  presetLabel: string,
  preprocess: boolean,
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrRunResult> {
  const text = await runOcr(image, onProgress, { crop, preprocess });
  const parsed = parseReceiptText(text);
  return {
    text,
    crop,
    presetLabel,
    preprocess,
    score: scoreReceiptParseResult(parsed) + scoreOcrTextQuality(text, preprocess),
  };
}

export async function runOcrWithRangeMode(
  image: File | Blob,
  options: RunOcrWithRangeModeOptions,
): Promise<OcrRunResult> {
  if (options.mode === "manual") {
    return runSingleOcr(image, options.crop, options.presetLabel ?? "手動", Boolean(options.preprocess), options.onProgress);
  }

  const presets = getBaseOcrPresets();
  let bestResult: OcrRunResult | null = null;

  for (const [index, preset] of presets.entries()) {
    const result = await runSingleOcr(
      image,
      preset.crop,
      preset.label,
      Boolean(preset.preprocess),
      (nextProgress) => {
        options.onProgress({
          status: `${preset.label} ${nextProgress.status}`,
          progress: (index + nextProgress.progress) / presets.length,
        });
      },
    );

    if (!bestResult || result.score > bestResult.score) {
      bestResult = result;
    }
  }

  if (!bestResult) {
    throw new Error("OCR候補を作成できませんでした");
  }

  return bestResult;
}
