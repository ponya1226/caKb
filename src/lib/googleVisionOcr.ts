import type { OcrProvider, OcrResult, OcrTextBlock } from "../types";

const GOOGLE_VISION_PROVIDER: OcrProvider = "googleVision";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type GoogleVisionProxyBlock = {
  text: unknown;
  granularity?: unknown;
  boundingBox?: unknown;
};

type GoogleVisionProxyResponse = {
  text?: unknown;
  provider?: unknown;
  confidence?: unknown;
  blocks?: unknown;
};

type GoogleVisionProxyErrorResponse = {
  code?: unknown;
};

export type GoogleVisionOcrOptions = {
  proxyUrl?: string | null;
  authToken?: string | null;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

function normalizeProxyUrl(value: string | undefined | null): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

export function getConfiguredGoogleVisionProxyUrl(): string | null {
  return normalizeProxyUrl(import.meta.env.VITE_GOOGLE_VISION_PROXY_URL);
}

export function isGoogleVisionOcrAvailable(proxyUrl = getConfiguredGoogleVisionProxyUrl()): boolean {
  return Boolean(normalizeProxyUrl(proxyUrl));
}

function getMimeType(image: File | Blob): string {
  return image.type || "image/jpeg";
}

function assertSupportedImage(image: File | Blob): string {
  const mimeType = getMimeType(image);
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("この画像形式はオンライン読み取りに対応していません");
  }

  return mimeType;
}

async function blobToBase64(image: File | Blob): Promise<string> {
  const bytes = new Uint8Array(await image.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function isBoundingBox(value: unknown): value is NonNullable<OcrTextBlock["boundingBox"]> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["x", "y", "width", "height"].every((key) => (
    typeof candidate[key] === "number" && Number.isFinite(candidate[key])
  ));
}

function normalizeBlock(block: GoogleVisionProxyBlock): OcrTextBlock | null {
  if (typeof block.text !== "string" || block.text.trim().length === 0) {
    return null;
  }

  return {
    text: block.text,
    ...(block.granularity === "word" ? { granularity: block.granularity } : {}),
    ...(isBoundingBox(block.boundingBox) ? { boundingBox: block.boundingBox } : {}),
  };
}

function normalizeBlocks(value: unknown): OcrTextBlock[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const blocks = value
    .map((block) => (block && typeof block === "object" ? normalizeBlock(block as GoogleVisionProxyBlock) : null))
    .filter((block): block is OcrTextBlock => Boolean(block));

  return blocks.length > 0 ? blocks : undefined;
}

function normalizeResponse(response: GoogleVisionProxyResponse): OcrResult {
  if (response.provider !== GOOGLE_VISION_PROVIDER) {
    throw new Error("オンライン読み取りから正しい結果を受け取れませんでした");
  }

  if (typeof response.text !== "string") {
    throw new Error("オンライン読み取りから文字を受け取れませんでした");
  }

  const blocks = normalizeBlocks(response.blocks);
  return {
    provider: GOOGLE_VISION_PROVIDER,
    text: response.text.trim(),
    ...(typeof response.confidence === "number" && Number.isFinite(response.confidence) ? { confidence: response.confidence } : {}),
    ...(blocks ? { blocks } : {}),
  };
}

export async function runGoogleVisionOcr(image: File | Blob, options: GoogleVisionOcrOptions = {}): Promise<OcrResult> {
  const proxyUrl = normalizeProxyUrl(options.proxyUrl ?? getConfiguredGoogleVisionProxyUrl());
  if (!proxyUrl) {
    throw new Error("オンライン読み取りは現在利用できません");
  }

  const mimeType = assertSupportedImage(image);
  const fetcher = options.fetcher ?? fetch;
  const authToken = options.authToken?.trim();
  const response = await fetcher(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      imageBase64: await blobToBase64(image),
      mimeType,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    if (response.status === 429) {
      const errorBody = await response.json().catch(() => null) as GoogleVisionProxyErrorResponse | null;
      if (errorBody?.code === "monthly_limit") {
        throw new Error("今月のオンライン読み取り回数が上限に達しました。端末内読み取りまたは手入力を利用してください");
      }
      throw new Error("オンライン読み取りを続けて実行しています。少し待ってからやり直すか、端末内読み取りを利用してください");
    }
    throw new Error("オンラインでレシートを読み取れませんでした。端末内読み取りまたは手入力を利用してください");
  }

  const responseBody = await response.json() as GoogleVisionProxyResponse;
  return normalizeResponse(responseBody);
}
