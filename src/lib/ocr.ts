import { recognize } from "tesseract.js";
import type { OcrProgress } from "../types";

type TesseractLog = {
  status?: string;
  progress?: number;
};

export type OcrCropRatios = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type RunOcrOptions = {
  crop?: OcrCropRatios;
};

type DrawableImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number) => void;
  close: () => void;
};

const MIN_REMAINING_CROP_RATIO = 0.08;

function hasCrop(crop?: OcrCropRatios): crop is OcrCropRatios {
  return Boolean(crop && (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0));
}

function clampRatioPercent(value: number): number {
  return Math.max(0, Math.min(100, value)) / 100;
}

async function decodeImage(image: Blob): Promise<DrawableImage> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(image);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, sourceX, sourceY, sourceWidth, sourceHeight) => {
        context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
      },
      close: () => bitmap.close(),
    };
  }

  const imageUrl = URL.createObjectURL(image);
  const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImageElement = new Image();
    nextImageElement.onload = () => resolve(nextImageElement);
    nextImageElement.onerror = () => reject(new Error("画像を読み込めませんでした"));
    nextImageElement.src = imageUrl;
  });

  return {
    width: imageElement.naturalWidth,
    height: imageElement.naturalHeight,
    draw: (context, sourceX, sourceY, sourceWidth, sourceHeight) => {
      context.drawImage(imageElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    },
    close: () => URL.revokeObjectURL(imageUrl),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement, fallback: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? fallback), "image/png");
  });
}

async function cropImageForOcr(image: File | Blob, crop?: OcrCropRatios): Promise<File | Blob> {
  if (!hasCrop(crop) || typeof document === "undefined" || typeof window === "undefined") {
    return image;
  }

  const decodedImage = await decodeImage(image);

  try {
    const leftRatio = clampRatioPercent(crop.left);
    const rightRatio = clampRatioPercent(crop.right);
    const topRatio = clampRatioPercent(crop.top);
    const bottomRatio = clampRatioPercent(crop.bottom);
    const widthRatio = Math.max(MIN_REMAINING_CROP_RATIO, 1 - leftRatio - rightRatio);
    const heightRatio = Math.max(MIN_REMAINING_CROP_RATIO, 1 - topRatio - bottomRatio);
    const sourceX = Math.min(decodedImage.width - 1, Math.round(decodedImage.width * leftRatio));
    const sourceY = Math.min(decodedImage.height - 1, Math.round(decodedImage.height * topRatio));
    const sourceWidth = Math.max(1, Math.min(decodedImage.width - sourceX, Math.round(decodedImage.width * widthRatio)));
    const sourceHeight = Math.max(1, Math.min(decodedImage.height - sourceY, Math.round(decodedImage.height * heightRatio)));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return image;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, sourceWidth, sourceHeight);
    decodedImage.draw(context, sourceX, sourceY, sourceWidth, sourceHeight);
    return canvasToBlob(canvas, image);
  } finally {
    decodedImage.close();
  }
}

export async function runOcr(
  image: File | Blob,
  onProgress?: (progress: OcrProgress) => void,
  options: RunOcrOptions = {},
): Promise<string> {
  onProgress?.({
    status: hasCrop(options.crop) ? "OCR範囲を準備中" : "starting",
    progress: 0,
  });

  const imageForOcr = await cropImageForOcr(image, options.crop);
  const result = await recognize(imageForOcr, "jpn+eng", {
    logger: (message: TesseractLog) => {
      onProgress?.({
        status: message.status ?? "processing",
        progress: message.progress ?? 0,
      });
    },
  });

  return result.data.text.trim();
}
