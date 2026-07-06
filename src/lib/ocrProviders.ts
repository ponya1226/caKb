import type { OcrProgress, OcrProvider, OcrResult } from "../types";
import { runGoogleVisionOcr, type GoogleVisionOcrOptions, isGoogleVisionOcrAvailable } from "./googleVisionOcr";
import { runOcrDetailed, type OcrCropRatios, type OcrPreprocessMode, type RunOcrResult } from "./ocr";

export type OcrProviderRunResult = OcrResult & {
  imagePreviewUrl?: string;
};

type LocalTesseractRunner = (
  image: File | Blob,
  onProgress?: (progress: OcrProgress) => void,
  options?: {
    crop?: OcrCropRatios;
    preprocess?: boolean;
    preprocessMode?: OcrPreprocessMode;
    includeImagePreview?: boolean;
  },
) => Promise<RunOcrResult>;

type GoogleVisionRunner = (image: File | Blob, options?: GoogleVisionOcrOptions) => Promise<OcrResult>;

export type RunOcrProviderOptions = {
  provider: OcrProvider;
  crop?: OcrCropRatios;
  preprocess?: boolean;
  preprocessMode?: OcrPreprocessMode;
  includeImagePreview?: boolean;
  onProgress?: (progress: OcrProgress) => void;
  googleVisionProxyUrl?: string | null;
  googleVisionAuthToken?: string | null;
  fetcher?: typeof fetch;
  localRunner?: LocalTesseractRunner;
  googleVisionRunner?: GoogleVisionRunner;
};

export function getOcrProviderLabel(provider: OcrProvider | undefined): string {
  if (provider === "googleVision") {
    return "Google Vision";
  }

  return "ローカルOCR";
}

export function isGoogleVisionProviderConfigured(proxyUrl?: string | null): boolean {
  return isGoogleVisionOcrAvailable(proxyUrl);
}

export async function runOcrProvider(image: File | Blob, options: RunOcrProviderOptions): Promise<OcrProviderRunResult> {
  if (options.provider === "googleVision") {
    options.onProgress?.({ status: "Google Vision OCRへ送信中", progress: 0.15 });
    const googleRunner = options.googleVisionRunner ?? runGoogleVisionOcr;
    const result = await googleRunner(image, {
      proxyUrl: options.googleVisionProxyUrl,
      authToken: options.googleVisionAuthToken,
      fetcher: options.fetcher,
    });
    options.onProgress?.({ status: "Google Vision OCR完了", progress: 1 });
    return result;
  }

  const localRunner = options.localRunner ?? runOcrDetailed;
  return localRunner(image, options.onProgress, {
    crop: options.crop,
    preprocess: options.preprocess,
    preprocessMode: options.preprocessMode,
    includeImagePreview: options.includeImagePreview,
  });
}
