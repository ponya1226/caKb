import { createWorker, OEM, PSM } from "tesseract.js";
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

export type OcrPreprocessMode = "contrast" | "binary" | "bold";

type RunOcrOptions = {
  crop?: OcrCropRatios;
  preprocess?: boolean;
  preprocessMode?: OcrPreprocessMode;
  includeImagePreview?: boolean;
};

export type RunOcrResult = {
  text: string;
  imagePreviewUrl?: string;
};

type DrawableImage = {
  width: number;
  height: number;
  draw: (
    context: CanvasRenderingContext2D,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destX?: number,
    destY?: number,
    destWidth?: number,
    destHeight?: number,
  ) => void;
  close: () => void;
};

type ImageRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_REMAINING_CROP_RATIO = 0.08;
const PAPER_REGION_ANALYSIS_WIDTH = 520;
const TEXT_REGION_ANALYSIS_WIDTH = 900;
const OCR_TARGET_WIDTH = 1800;
const OCR_MAX_SCALE = 4;
const OCR_MAX_HEIGHT = 6500;
const TEXT_REGION_MIN_RATIO = 0.18;
const DETECTED_CROP_MAX_COMBINED_PERCENT = 86;
const DETECTED_CROP_MAX_HEIGHT_PERCENT = 72;
const OCR_PADDING_PX = 48;

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
      draw: (context, sourceX, sourceY, sourceWidth, sourceHeight, destX = 0, destY = 0, destWidth = sourceWidth, destHeight = sourceHeight) => {
        context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
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
    draw: (context, sourceX, sourceY, sourceWidth, sourceHeight, destX = 0, destY = 0, destWidth = sourceWidth, destHeight = sourceHeight) => {
      context.drawImage(imageElement, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
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

function isPaperPixel(data: Uint8ClampedArray, index: number): boolean {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const darkest = Math.min(red, green, blue);

  return brightness >= 166 && darkest >= 136 && spread <= 72;
}

function toSourceRegion(
  bounds: { left: number; top: number; right: number; bottom: number },
  sourceWidth: number,
  sourceHeight: number,
  analysisWidth: number,
  analysisHeight: number,
  paddingRatio: number,
): ImageRegion {
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const xPadding = Math.max(2, Math.round(width * paddingRatio));
  const yPadding = Math.max(2, Math.round(height * paddingRatio));
  const left = Math.max(0, bounds.left - xPadding);
  const top = Math.max(0, bounds.top - yPadding);
  const right = Math.min(analysisWidth - 1, bounds.right + xPadding);
  const bottom = Math.min(analysisHeight - 1, bounds.bottom + yPadding);
  const scaleX = sourceWidth / analysisWidth;
  const scaleY = sourceHeight / analysisHeight;
  const x = Math.max(0, Math.floor(left * scaleX));
  const y = Math.max(0, Math.floor(top * scaleY));
  const sourceRight = Math.min(sourceWidth, Math.ceil((right + 1) * scaleX));
  const sourceBottom = Math.min(sourceHeight, Math.ceil((bottom + 1) * scaleY));

  return {
    x,
    y,
    width: Math.max(1, sourceRight - x),
    height: Math.max(1, sourceBottom - y),
  };
}

function detectPaperRegion(canvas: HTMLCanvasElement): ImageRegion | null {
  const analysisWidth = Math.min(PAPER_REGION_ANALYSIS_WIDTH, canvas.width);
  const analysisHeight = Math.max(1, Math.round((canvas.height * analysisWidth) / canvas.width));
  const analysisCanvas = createCanvas(analysisWidth, analysisHeight);

  if (!analysisCanvas) {
    return null;
  }

  const analysisContext = getContext(analysisCanvas);
  if (!analysisContext) {
    return null;
  }

  analysisContext.fillStyle = "#000000";
  analysisContext.fillRect(0, 0, analysisWidth, analysisHeight);
  analysisContext.drawImage(canvas, 0, 0, analysisWidth, analysisHeight);

  const imageData = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight);
  const pixelCount = analysisWidth * analysisHeight;
  const mask = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    mask[index] = isPaperPixel(imageData.data, index * 4) ? 1 : 0;
  }

  const queue = new Int32Array(pixelCount);
  let best: { left: number; top: number; right: number; bottom: number; area: number; score: number } | null = null;

  for (let startIndex = 0; startIndex < pixelCount; startIndex += 1) {
    if (visited[startIndex] || !mask[startIndex]) {
      continue;
    }

    let queueStart = 0;
    let queueEnd = 0;
    let area = 0;
    let left = analysisWidth;
    let right = 0;
    let top = analysisHeight;
    let bottom = 0;
    visited[startIndex] = 1;
    queue[queueEnd] = startIndex;
    queueEnd += 1;

    while (queueStart < queueEnd) {
      const currentIndex = queue[queueStart];
      queueStart += 1;
      const x = currentIndex % analysisWidth;
      const y = Math.floor(currentIndex / analysisWidth);
      area += 1;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);

      if (x > 0) {
        const nextIndex = currentIndex - 1;
        if (!visited[nextIndex] && mask[nextIndex]) {
          visited[nextIndex] = 1;
          queue[queueEnd] = nextIndex;
          queueEnd += 1;
        }
      }
      if (x < analysisWidth - 1) {
        const nextIndex = currentIndex + 1;
        if (!visited[nextIndex] && mask[nextIndex]) {
          visited[nextIndex] = 1;
          queue[queueEnd] = nextIndex;
          queueEnd += 1;
        }
      }
      if (y > 0) {
        const nextIndex = currentIndex - analysisWidth;
        if (!visited[nextIndex] && mask[nextIndex]) {
          visited[nextIndex] = 1;
          queue[queueEnd] = nextIndex;
          queueEnd += 1;
        }
      }
      if (y < analysisHeight - 1) {
        const nextIndex = currentIndex + analysisWidth;
        if (!visited[nextIndex] && mask[nextIndex]) {
          visited[nextIndex] = 1;
          queue[queueEnd] = nextIndex;
          queueEnd += 1;
        }
      }
    }

    const componentWidth = right - left + 1;
    const componentHeight = bottom - top + 1;
    const widthRatio = componentWidth / analysisWidth;
    const heightRatio = componentHeight / analysisHeight;
    const areaRatio = area / pixelCount;
    const aspectRatio = componentHeight / Math.max(1, componentWidth);
    const centerX = (left + right) / 2 / analysisWidth;
    const centerScore = 1 - Math.min(0.6, Math.abs(centerX - 0.5) * 1.8);
    const isUsefulReceiptShape =
      areaRatio >= 0.05 &&
      widthRatio >= 0.16 &&
      widthRatio <= 0.86 &&
      heightRatio >= 0.34 &&
      aspectRatio >= 1.1;

    if (!isUsefulReceiptShape) {
      continue;
    }

    const score = area * centerScore * (1 + heightRatio) * Math.min(2.2, aspectRatio);
    if (!best || score > best.score) {
      best = { left, top, right, bottom, area, score };
    }
  }

  if (!best) {
    return null;
  }

  return toSourceRegion(best, canvas.width, canvas.height, analysisWidth, analysisHeight, 0.025);
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

function getPreprocessRegion(canvas: HTMLCanvasElement): ImageRegion {
  return detectPaperRegion(canvas) ??
    detectTextRegion(canvas) ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
}

function constrainCropPair(first: number, second: number): [number, number] {
  const total = first + second;
  if (total <= DETECTED_CROP_MAX_COMBINED_PERCENT) {
    return [first, second];
  }

  const scale = DETECTED_CROP_MAX_COMBINED_PERCENT / total;
  return [Math.round(first * scale), Math.round(second * scale)];
}

function trimDetectedCropTail(top: number, bottom: number): [number, number] {
  const height = 100 - top - bottom;
  if (height <= DETECTED_CROP_MAX_HEIGHT_PERCENT) {
    return [top, bottom];
  }

  return [top, bottom + height - DETECTED_CROP_MAX_HEIGHT_PERCENT];
}

function toDetectedCropRatios(region: ImageRegion, imageWidth: number, imageHeight: number): OcrCropRatios {
  const left = Math.max(0, Math.min(100, Math.round((region.x / imageWidth) * 100)));
  const top = Math.max(0, Math.min(100, Math.round((region.y / imageHeight) * 100)));
  const right = Math.max(0, Math.min(100, Math.round(((imageWidth - region.x - region.width) / imageWidth) * 100)));
  const bottom = Math.max(0, Math.min(100, Math.round(((imageHeight - region.y - region.height) / imageHeight) * 100)));
  const [nextLeft, nextRight] = constrainCropPair(left, right);
  const [heightLimitedTop, heightLimitedBottom] = trimDetectedCropTail(top, bottom);
  const [nextTop, nextBottom] = constrainCropPair(heightLimitedTop, heightLimitedBottom);

  return {
    top: nextTop,
    right: nextRight,
    bottom: nextBottom,
    left: nextLeft,
  };
}

export async function detectOcrCrop(image: File | Blob): Promise<OcrCropRatios | null> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }

  const decodedImage = await decodeImage(image);

  try {
    const canvas = createCanvas(decodedImage.width, decodedImage.height);
    if (!canvas) {
      return null;
    }

    const context = getContext(canvas);
    if (!context) {
      return null;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, decodedImage.width, decodedImage.height);
    decodedImage.draw(context, 0, 0, decodedImage.width, decodedImage.height);

    const region = detectPaperRegion(canvas) ?? detectTextRegion(canvas);
    return region ? toDetectedCropRatios(region, canvas.width, canvas.height) : null;
  } finally {
    decodedImage.close();
  }
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getGray(data: Uint8ClampedArray, index: number): number {
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function calculateOtsuThreshold(data: Uint8ClampedArray): number {
  const histogram = new Uint32Array(256);
  const pixelCount = data.length / 4;
  let total = 0;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(getGray(data, index));
    histogram[gray] += 1;
    total += gray;
  }

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 150;

  for (let threshold = 0; threshold < histogram.length; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (backgroundWeight === 0) {
      continue;
    }

    const foregroundWeight = pixelCount - backgroundWeight;
    if (foregroundWeight === 0) {
      break;
    }

    backgroundSum += threshold * histogram[threshold];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (total - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }

  return Math.max(105, Math.min(190, bestThreshold));
}

function sharpenImageData(imageData: ImageData): void {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = source[index + channel] * 5;
        const top = source[((y - 1) * width + x) * 4 + channel];
        const bottom = source[((y + 1) * width + x) * 4 + channel];
        const left = source[(y * width + x - 1) * 4 + channel];
        const right = source[(y * width + x + 1) * 4 + channel];
        data[index + channel] = clampColor(center - top - bottom - left - right);
      }
    }
  }
}

function thickenBlackPixels(imageData: ImageData): void {
  const { data, width, height } = imageData;
  const source = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index] > 80) {
        continue;
      }

      [
        index - 4,
        index + 4,
        index - width * 4,
        index + width * 4,
      ].forEach((nextIndex) => {
        data[nextIndex] = 0;
        data[nextIndex + 1] = 0;
        data[nextIndex + 2] = 0;
        data[nextIndex + 3] = 255;
      });
    }
  }
}

function enhanceForOcr(canvas: HTMLCanvasElement, mode: OcrPreprocessMode): void {
  const context = getContext(canvas);
  if (!context) {
    return;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  sharpenImageData(imageData);

  if (mode === "binary" || mode === "bold") {
    const threshold = calculateOtsuThreshold(data);

    for (let index = 0; index < data.length; index += 4) {
      const gray = getGray(data, index);
      const value = gray < threshold ? 0 : 255;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }

    if (mode === "bold") {
      thickenBlackPixels(imageData);
    }

    context.putImageData(imageData, 0, 0);
    return;
  }

  for (let index = 0; index < data.length; index += 4) {
    const gray = getGray(data, index);
    const contrasted = Math.round((gray - 128) * 1.75 + 154);
    const value = clampColor(contrasted);
    const normalized = value > 238 ? 255 : value < 34 ? 0 : value;

    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

async function addWhitePadding(image: Blob): Promise<Blob> {
  const decodedImage = await decodeImage(image);

  try {
    const outputWidth = decodedImage.width + OCR_PADDING_PX * 2;
    const outputHeight = decodedImage.height + OCR_PADDING_PX * 2;
    const canvas = createCanvas(outputWidth, outputHeight);
    if (!canvas) {
      return image;
    }

    const context = getContext(canvas);
    if (!context) {
      return image;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, outputWidth, outputHeight);
    decodedImage.draw(
      context,
      0,
      0,
      decodedImage.width,
      decodedImage.height,
      OCR_PADDING_PX,
      OCR_PADDING_PX,
      decodedImage.width,
      decodedImage.height,
    );
    return canvasToBlob(canvas, image);
  } finally {
    decodedImage.close();
  }
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

async function preprocessImageForOcr(image: File | Blob, mode: OcrPreprocessMode): Promise<File | Blob> {
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

    const sourceRegion = getPreprocessRegion(sourceCanvas);
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
    enhanceForOcr(outputCanvas, mode);

    const enhancedImage = await canvasToBlob(outputCanvas, image);
    return addWhitePadding(enhancedImage);
  } finally {
    decodedImage.close();
  }
}

export async function runOcrDetailed(
  image: File | Blob,
  onProgress?: (progress: OcrProgress) => void,
  options: RunOcrOptions = {},
): Promise<RunOcrResult> {
  onProgress?.({
    status: hasCrop(options.crop) ? "OCR範囲を準備中" : "starting",
    progress: 0,
  });

  const croppedImage = await cropImageForOcr(image, options.crop);
  const preprocessMode = options.preprocessMode ?? "contrast";
  onProgress?.({
    status: options.preprocess ? "OCR画像を補正中" : "OCR画像を準備中",
    progress: 0,
  });
  const imageForOcr = options.preprocess ? await preprocessImageForOcr(croppedImage, preprocessMode) : await addWhitePadding(croppedImage);
  const imagePreviewUrl = options.includeImagePreview === false ? undefined : URL.createObjectURL(imageForOcr);
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    worker = await createWorker("jpn+eng", OEM.LSTM_ONLY, {
      logger: (message: TesseractLog) => {
        onProgress?.({
          status: message.status ?? "processing",
          progress: message.progress ?? 0,
        });
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: options.preprocess ? PSM.SINGLE_BLOCK : PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(imageForOcr);
    return {
      text: result.data.text.trim(),
      ...(imagePreviewUrl ? { imagePreviewUrl } : {}),
    };
  } catch (error) {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    throw error;
  } finally {
    await worker?.terminate();
  }
}

export async function runOcr(
  image: File | Blob,
  onProgress?: (progress: OcrProgress) => void,
  options: RunOcrOptions = {},
): Promise<string> {
  const result = await runOcrDetailed(image, onProgress, { ...options, includeImagePreview: false });
  return result.text;
}
