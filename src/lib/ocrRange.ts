import type { OcrProgress } from "../types";
import type { OcrProvider, OcrTextBlock } from "../types";
import type { OcrCropRatios, OcrPreprocessMode } from "./ocr";
import { BOTTOMLESS_OCR_CROP, FULL_OCR_CROP, RECEIPT_BODY_CROP } from "./ocrCrop";
import { runOcrProvider } from "./ocrProviders";
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
  preprocessMode?: OcrPreprocessMode;
};

export type OcrRunResult = {
  provider: OcrProvider;
  text: string;
  crop: OcrCropRatios;
  presetLabel: string;
  preprocess: boolean;
  preprocessMode: OcrPreprocessMode;
  ocrImagePreviewUrl?: string;
  confidence?: number;
  blocks?: OcrTextBlock[];
  score: number;
};

type RunOcrWithRangeModeOptions = {
  provider?: OcrProvider;
  mode: OcrMode;
  crop: OcrCropRatios;
  presetLabel: string | null;
  preprocess?: boolean;
  preprocessMode?: OcrPreprocessMode;
  savedOcrCrop?: OcrCropRatios;
  googleVisionProxyUrl?: string | null;
  googleVisionAuthToken?: string | null;
  onProgress: (progress: OcrProgress) => void;
};

export function isSameCrop(first: OcrCropRatios, second: OcrCropRatios): boolean {
  return first.top === second.top && first.right === second.right && first.bottom === second.bottom && first.left === second.left;
}

function getBaseOcrPresets(): OcrPreset[] {
  return [
    { id: "document", label: "用紙補正", crop: FULL_OCR_CROP, preprocess: true, preprocessMode: "contrast" },
    { id: "document-binary", label: "二値化補正", crop: FULL_OCR_CROP, preprocess: true, preprocessMode: "binary" },
    { id: "document-bold", label: "太字補正", crop: FULL_OCR_CROP, preprocess: true, preprocessMode: "bold" },
    { id: "document-body", label: "本体補正", crop: RECEIPT_BODY_CROP, preprocess: true, preprocessMode: "contrast" },
    { id: "document-bottomless", label: "下部除外補正", crop: BOTTOMLESS_OCR_CROP, preprocess: true, preprocessMode: "bold" },
    { id: "body", label: "本体", crop: RECEIPT_BODY_CROP },
    { id: "full", label: "全体", crop: FULL_OCR_CROP },
  ];
}

export function getOcrPresets(savedOcrCrop?: OcrCropRatios): OcrPreset[] {
  const presets = getBaseOcrPresets();

  if (savedOcrCrop && presets.every((preset) => !isSameCrop(preset.crop, savedOcrCrop))) {
    return [
      { id: "last-document", label: "前回補正", crop: savedOcrCrop, preprocess: true, preprocessMode: "contrast" },
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
  preprocessMode: OcrPreprocessMode,
  onProgress: (progress: OcrProgress) => void,
): Promise<OcrRunResult> {
  const result = await runOcrProvider(image, {
    provider: "localTesseract",
    crop,
    preprocess,
    preprocessMode,
    onProgress,
  });
  const text = result.text;
  const parsed = parseReceiptText(text);
  return {
    provider: result.provider,
    text,
    crop,
    presetLabel,
    preprocess,
    preprocessMode,
    ...(result.imagePreviewUrl ? { ocrImagePreviewUrl: result.imagePreviewUrl } : {}),
    ...(typeof result.confidence === "number" ? { confidence: result.confidence } : {}),
    ...(result.blocks ? { blocks: result.blocks } : {}),
    score: scoreReceiptParseResult(parsed) + scoreOcrTextQuality(text, preprocess),
  };
}

function revokeOcrImagePreview(result: OcrRunResult | null): void {
  if (result?.ocrImagePreviewUrl) {
    URL.revokeObjectURL(result.ocrImagePreviewUrl);
  }
}

export async function runOcrWithRangeMode(
  image: File | Blob,
  options: RunOcrWithRangeModeOptions,
): Promise<OcrRunResult> {
  if (options.provider === "googleVision") {
    const result = await runOcrProvider(image, {
      provider: "googleVision",
      googleVisionProxyUrl: options.googleVisionProxyUrl,
      googleVisionAuthToken: options.googleVisionAuthToken,
      onProgress: options.onProgress,
    });
    const parsed = parseReceiptText(result.text);
    return {
      provider: result.provider,
      text: result.text,
      crop: FULL_OCR_CROP,
      presetLabel: "全体",
      preprocess: false,
      preprocessMode: options.preprocessMode ?? "contrast",
      ...(typeof result.confidence === "number" ? { confidence: result.confidence } : {}),
      ...(result.blocks ? { blocks: result.blocks } : {}),
      score: scoreReceiptParseResult(parsed) + scoreOcrTextQuality(result.text, false),
    };
  }

  if (options.mode === "manual") {
    return runSingleOcr(
      image,
      options.crop,
      options.presetLabel ?? "手動",
      Boolean(options.preprocess),
      options.preprocessMode ?? "contrast",
      options.onProgress,
    );
  }

  const presets = getBaseOcrPresets();
  let bestResult: OcrRunResult | null = null;

  for (const [index, preset] of presets.entries()) {
    const result = await runSingleOcr(
      image,
      preset.crop,
      preset.label,
      Boolean(preset.preprocess),
      preset.preprocessMode ?? "contrast",
      (nextProgress) => {
        options.onProgress({
          status: `${preset.label} ${nextProgress.status}`,
          progress: (index + nextProgress.progress) / presets.length,
        });
      },
    );

    if (!bestResult || result.score > bestResult.score) {
      revokeOcrImagePreview(bestResult);
      bestResult = result;
    } else {
      revokeOcrImagePreview(result);
    }
  }

  if (!bestResult) {
    throw new Error("OCR候補を作成できませんでした");
  }

  return bestResult;
}
