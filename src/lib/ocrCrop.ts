import type { OcrCropRatios } from "./ocr";

export const MAX_COMBINED_CROP_PERCENT = 86;
export const FULL_OCR_CROP: OcrCropRatios = { top: 0, right: 0, bottom: 0, left: 0 };
export const RECEIPT_BODY_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 34, left: 18 };
export const BOTTOMLESS_OCR_CROP: OcrCropRatios = { top: 0, right: 18, bottom: 44, left: 18 };

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
