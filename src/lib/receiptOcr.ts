import type { OcrProgress, OcrResult } from "../types";
import {
  isGoogleVisionOcrAvailable,
  runGoogleVisionOcr,
  type GoogleVisionOcrOptions,
} from "./googleVisionOcr";

export type RunReceiptOcrOptions = GoogleVisionOcrOptions & {
  onProgress?: (progress: OcrProgress) => void;
};

export function isReceiptOcrConfigured(proxyUrl?: string | null): boolean {
  return isGoogleVisionOcrAvailable(proxyUrl);
}

export async function runReceiptOcr(
  image: File | Blob,
  options: RunReceiptOcrOptions = {},
): Promise<OcrResult> {
  options.onProgress?.({ status: "オンラインで読み取り中", progress: 0.15 });
  const result = await runGoogleVisionOcr(image, options);
  options.onProgress?.({ status: "読み取り完了", progress: 1 });
  return result;
}
