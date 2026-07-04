import type { OcrProgress } from "../types";
import { runOcr } from "./ocr";
import type { OcrCropRatios } from "./ocr";
import { parseReceiptText, scoreReceiptParseResult } from "./receiptParser";

export const MAX_COMBINED_CROP_PERCENT = 86;
export const FULL_OCR_CROP: OcrCropRatios = { top: 0, right: 0, bottom: 0, left: 0 };
export const RECEIPT_BODY_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 34, left: 18 };
export const BOTTOMLESS_OCR_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 44, left: 18 };

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

export function getPairedCropSide(side: keyof OcrCropRatios): keyof OcrCropRatios {
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

export function getOcrPresets(savedOcrCrop?: OcrCropRatios): OcrPreset[] {
  const presets: OcrPreset[] = [
    { id: "document", label: "用紙補正", crop: FULL_OCR_CROP, preprocess: true },
    { id: "document-body", label: "本体補正", crop: RECEIPT_BODY_CROP, preprocess: true },
    { id: "document-bottomless", label: "下部除外補正", crop: BOTTOMLESS_OCR_CROP, preprocess: true },
    { id: "body", label: "本体", crop: RECEIPT_BODY_CROP },
    { id: "full", label: "全体", crop: FULL_OCR_CROP },
  ];

  if (savedOcrCrop && presets.every((preset) => !isSameCrop(preset.crop, savedOcrCrop))) {
    return [
      { id: "last-document", label: "前回補正", crop: savedOcrCrop, preprocess: true },
      { id: "last", label: "前回", crop: savedOcrCrop },
      ...presets,
    ];
  }

  return presets;
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
    score: scoreReceiptParseResult(parsed),
  };
}

export async function runOcrWithRangeMode(
  image: File | Blob,
  options: RunOcrWithRangeModeOptions,
): Promise<OcrRunResult> {
  if (options.mode === "manual") {
    return runSingleOcr(image, options.crop, options.presetLabel ?? "手動", Boolean(options.preprocess), options.onProgress);
  }

  const presets = getOcrPresets(options.savedOcrCrop);
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
