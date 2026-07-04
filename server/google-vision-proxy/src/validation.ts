export type OcrRequest = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type ValidationResult =
  | { ok: true; value: OcrRequest }
  | { ok: false; status: number; message: string };

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function parseMaxImageBytes(value: string | undefined, fallback = 5 * 1024 * 1024): number {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? Math.floor(parsedValue) : fallback;
}

export function estimateBase64Bytes(imageBase64: string): number {
  const normalized = imageBase64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function validateOcrRequestBody(body: unknown, maxImageBytes: number): ValidationResult {
  if (!isRecord(body)) {
    return { ok: false, status: 400, message: "Invalid request body" };
  }

  if (typeof body.imageBase64 !== "string" || body.imageBase64.trim().length === 0) {
    return { ok: false, status: 400, message: "imageBase64 is required" };
  }

  if (typeof body.mimeType !== "string" || !ALLOWED_MIME_TYPES.has(body.mimeType)) {
    return { ok: false, status: 415, message: "Unsupported image mime type" };
  }

  if (estimateBase64Bytes(body.imageBase64) > maxImageBytes) {
    return { ok: false, status: 413, message: "Image is too large" };
  }

  return {
    ok: true,
    value: {
      imageBase64: body.imageBase64,
      mimeType: body.mimeType as OcrRequest["mimeType"],
    },
  };
}
