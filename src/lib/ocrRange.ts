import type { OcrProgress } from "../types";
import { runOcr } from "./ocr";
import type { OcrCropRatios } from "./ocr";
import { parseReceiptText, scoreReceiptParseResult } from "./receiptParser";

export const MAX_COMBINED_CROP_PERCENT = 86;
export const FULL_OCR_CROP: OcrCropRatios = { top: 0, right: 0, bottom: 0, left: 0 };
export const RECEIPT_BODY_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 34, left: 18 };
export const BOTTOMLESS_OCR_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 44, left: 18 };
export const CENTERED_OCR_CROP: OcrCropRatios = { top: 4, right: 22, bottom: 32, left: 22 };

export type OcrMode = "auto" | "manual";

export type OcrPreset = {
  id: string;
  label: string;
  crop: OcrCropRatios;
};

export type OcrRunResult = {
  text: string;
  crop: OcrCropRatios;
  presetLabel: string;
  score: number;
};

type RunOcrWithRangeModeOptions = {
  mode: OcrMode;
  crop: OcrCropRatios;
  presetLabel: string | null;
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
    { id: "body", label: "本体", crop: RECEIPT_BODY_CROP },
    { id: "bottomless", label: "下部除外", crop: BOTTOMLESS_OCR_CROP },
    { id: "centered", label: "中央寄せ", crop: CENTERED_OCR_CROP },
    { id: "full", label: "全体", crop: FULL_OCR_CROP },
  ];

  if (savedOcrCrop && presets.every((preset) => !isSameCrop(preset.crop, savedOcrCrop))) {
    return [{ id: "last", label: "前回", crop: savedOcrCrop }, ...presets];
  }

  return presets;
}

async function runSingleOcr(
  image: File | Blob,
  crop: OcrCropRatios,
  presetLabel: string,
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrRunResult> {
  const text = await runOcr(image, onProgress, { crop });
  const parsed = parseReceiptText(text);
  return {
    text,
    crop,
    presetLabel,
    score: scoreReceiptParseResult(parsed),
  };
}

export async function runOcrWithRangeMode(
  image: File | Blob,
  options: RunOcrWithRangeModeOptions,
): Promise<OcrRunResult> {
  if (options.mode === "manual") {
    return runSingleOcr(image, options.crop, options.presetLabel ?? "手動", options.onProgress);
  }

  const presets = getOcrPresets(options.savedOcrCrop);
  let bestResult: OcrRunResult | null = null;

  for (const [index, preset] of presets.entries()) {
    const result = await runSingleOcr(
      image,
      preset.crop,
      preset.label,
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
