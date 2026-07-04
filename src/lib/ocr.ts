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
  preprocess?: boolean;
};

type DrawableImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number) => void;
  close: () => void;
};

type ImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_REMAINING_CROP_RATIO = 0.08;
const TEXT_REGION_ANALYSIS_WIDTH = 900;
const OCR_TARGET_WIDTH = 1500;
const OCR_MAX_SCALE = 3;
const OCR_MAX_HEIGHT = 5200;
const TEXT_REGION_MIN_RATIO = 0.18;

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

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", { alpha: false });
}

function getBounds(mask: boolean[], minSpan: number): { start: number; end: number } | null {
  let start = -1;
  let end = -1;
  let bestStart = -1;
  let bestEnd = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) {
      if (start === -1) {
        start = index;
      }
      end = index;
      continue;
    }

    if (start !== -1 && end - start > bestEnd - bestStart) {
      bestStart = start;
      bestEnd = end;
    }
    start = -1;
    end = -1;
  }

  if (start !== -1 && end - start > bestEnd - bestStart) {
    bestStart = start;
    bestEnd = end;
  }

  if (bestStart === -1 || bestEnd - bestStart + 1 < minSpan) {
    return null;
  }

  return { start: bestStart, end: bestEnd };
}

function fillSmallGaps(mask: boolean[], maxGap: number): boolean[] {
  const filled = [...mask];
  let index = 0;

  while (index < filled.length) {
    if (filled[index]) {
      index += 1;
      continue;
    }

    const gapStart = index;
    while (index < filled.length && !filled[index]) {
      index += 1;
    }
    const gapEnd = index - 1;
    const hasLeft = gapStart > 0 && filled[gapStart - 1];
    const hasRight = index < filled.length && filled[index];

    if (hasLeft && hasRight && gapEnd - gapStart + 1 <= maxGap) {
      for (let fillIndex = gapStart; fillIndex <= gapEnd; fillIndex += 1) {
        filled[fillIndex] = true;
      }
    }
  }

  return filled;
}

function padBounds(start: number, end: number, max: number, ratio: number): { start: number; end: number } {
  const padding = Math.max(4, Math.round((end - start + 1) * ratio));
  return {
    start: Math.max(0, start - padding),
    end: Math.min(max - 1, end + padding),
  };
}

function isTextPixel(data: Uint8ClampedArray, index: number): boolean {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const gray = red * 0.299 + green * 0.587 + blue * 0.114;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

  return gray < 115 || (gray < 150 && spread > 40);
}

function detectTextRegion(canvas: HTMLCanvasElement): ImageRegion | null {
  const analysisWidth = Math.min(TEXT_REGION_ANALYSIS_WIDTH, canvas.width);
  const analysisHeight = Math.max(1, Math.round((canvas.height * analysisWidth) / canvas.width));
  const analysisCanvas = createCanvas(analysisWidth, analysisHeight);

  if (!analysisCanvas) {
    return null;
  }

  const analysisContext = getContext(analysisCanvas);
  if (!analysisContext) {
    return null;
  }

  analysisContext.fillStyle = "#ffffff";
  analysisContext.fillRect(0, 0, analysisWidth, analysisHeight);
  analysisContext.drawImage(canvas, 0, 0, analysisWidth, analysisHeight);

  const imageData = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight);
  const columnCounts = new Uint32Array(analysisWidth);
  const rowCounts = new Uint32Array(analysisHeight);

  for (let y = 0; y < analysisHeight; y += 1) {
    for (let x = 0; x < analysisWidth; x += 1) {
      const index = (y * analysisWidth + x) * 4;
      if (isTextPixel(imageData.data, index)) {
        columnCounts[x] += 1;
        rowCounts[y] += 1;
      }
    }
  }

  const columnThreshold = Math.max(4, Math.round(analysisHeight * 0.014));
  const rowThreshold = Math.max(4, Math.round(analysisWidth * 0.005));
  const columnMask = fillSmallGaps(Array.from(columnCounts, (count) => count >= columnThreshold), Math.round(analysisWidth * 0.025));
  const rowMask = fillSmallGaps(Array.from(rowCounts, (count) => count >= rowThreshold), Math.round(analysisHeight * 0.018));
  const columnBounds = getBounds(columnMask, Math.round(analysisWidth * TEXT_REGION_MIN_RATIO));
  const rowBounds = getBounds(rowMask, Math.round(analysisHeight * TEXT_REGION_MIN_RATIO));

  if (!columnBounds || !rowBounds) {
    return null;
  }

  const paddedX = padBounds(columnBounds.start, columnBounds.end, analysisWidth, 0.2);
  const paddedY = padBounds(rowBounds.start, rowBounds.end, analysisHeight, 0.08);
  const scaleX = canvas.width / analysisWidth;
  const scaleY = canvas.height / analysisHeight;
  const x = Math.max(0, Math.floor(paddedX.start * scaleX));
  const y = Math.max(0, Math.floor(paddedY.start * scaleY));
  const right = Math.min(canvas.width, Math.ceil((paddedX.end + 1) * scaleX));
  const bottom = Math.min(canvas.height, Math.ceil((paddedY.end + 1) * scaleY));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function enhanceForOcr(canvas: HTMLCanvasElement): void {
  const context = getContext(canvas);
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.round((gray - 128) * 1.55 + 150);
    const value = Math.max(0, Math.min(255, contrasted));
    const normalized = value > 238 ? 255 : value < 34 ? 0 : value;

    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
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
    const canvas = createCanvas(sourceWidth, sourceHeight);

    if (!canvas) {
      return image;
    }

    const context = getContext(canvas);
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

async function preprocessImageForOcr(image: File | Blob): Promise<File | Blob> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return image;
  }

  const decodedImage = await decodeImage(image);

  try {
    const sourceCanvas = createCanvas(decodedImage.width, decodedImage.height);
    if (!sourceCanvas) {
      return image;
    }

    const sourceContext = getContext(sourceCanvas);
    if (!sourceContext) {
      return image;
    }

    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, decodedImage.width, decodedImage.height);
    decodedImage.draw(sourceContext, 0, 0, decodedImage.width, decodedImage.height);

    const detectedRegion = detectTextRegion(sourceCanvas);
    const sourceRegion = detectedRegion ?? {
      x: 0,
      y: 0,
      width: decodedImage.width,
      height: decodedImage.height,
    };
    const scaleByWidth = OCR_TARGET_WIDTH / sourceRegion.width;
    const scaleByHeight = OCR_MAX_HEIGHT / sourceRegion.height;
    const scale = Math.max(1, Math.min(OCR_MAX_SCALE, scaleByWidth, scaleByHeight));
    const outputWidth = Math.max(1, Math.round(sourceRegion.width * scale));
    const outputHeight = Math.max(1, Math.round(sourceRegion.height * scale));
    const outputCanvas = createCanvas(outputWidth, outputHeight);

    if (!outputCanvas) {
      return image;
    }

    const outputContext = getContext(outputCanvas);
    if (!outputContext) {
      return image;
    }

    outputContext.fillStyle = "#ffffff";
    outputContext.fillRect(0, 0, outputWidth, outputHeight);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(
      sourceCanvas,
      sourceRegion.x,
      sourceRegion.y,
      sourceRegion.width,
      sourceRegion.height,
      0,
      0,
      outputWidth,
      outputHeight,
    );
    enhanceForOcr(outputCanvas);

    return canvasToBlob(outputCanvas, image);
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

  const croppedImage = await cropImageForOcr(image, options.crop);
  onProgress?.({
    status: options.preprocess ? "OCR画像を補正中" : "OCR画像を準備中",
    progress: 0,
  });
  const imageForOcr = options.preprocess ? await preprocessImageForOcr(croppedImage) : croppedImage;
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
