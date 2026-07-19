import { describe, expect, it } from "vitest";
import { isGoogleVisionOcrAvailable, runGoogleVisionOcr } from "./googleVisionOcr";
import { runOcrProvider } from "./ocrProviders";
import { parseReceiptText } from "./receiptParser";
import type { OcrResult } from "../types";

function createImageBlob(): Blob {
  return new Blob(["image"], { type: "image/png" });
}

describe("ocrProviders", () => {
  it("runs the localTesseract provider through the local OCR runner", async () => {
    const result = await runOcrProvider(createImageBlob(), {
      provider: "localTesseract",
      localRunner: async () => ({
        provider: "localTesseract",
        text: "2026年07月01日\n合計 ¥481",
      }),
    });

    expect(result.provider).toBe("localTesseract");
    expect(result.text).toContain("¥481");
  });

  it("passes googleVision text to the existing receipt parser", async () => {
    const googleResult: OcrResult = {
      provider: "googleVision",
      text: "サンプルストア\n2026年07月01日\n合計 ¥1,000",
    };
    const result = await runOcrProvider(createImageBlob(), {
      provider: "googleVision",
      googleVisionRunner: async () => googleResult,
    });
    const parsed = parseReceiptText(result.text);

    expect(result.provider).toBe("googleVision");
    expect(parsed.dateCandidates[0]?.value).toBe("2026-07-01");
    expect(parsed.amountCandidates[0]?.value).toBe(1000);
  });

  it("reports googleVision as unavailable when proxy URL is empty", () => {
    expect(isGoogleVisionOcrAvailable("")).toBe(false);
    expect(isGoogleVisionOcrAvailable("   ")).toBe(false);
  });

  it("rejects googleVision OCR when proxy URL is not configured", async () => {
    await expect(runGoogleVisionOcr(createImageBlob(), { proxyUrl: "" })).rejects.toThrow(
      "Google Vision OCR Proxy URLが設定されていません",
    );
  });

  it("returns a safe error when googleVision proxy fails", async () => {
    await expect(
      runGoogleVisionOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => new Response("internal", { status: 500 }),
      }),
    ).rejects.toThrow("Google Vision OCRに失敗しました");
  });

  it("explains when the monthly googleVision limit is reached", async () => {
    await expect(
      runGoogleVisionOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => Response.json({ code: "monthly_limit" }, { status: 429 }),
      }),
    ).rejects.toThrow("今月の高精度OCR利用上限に達しました");
  });

  it("asks the user to wait after a short-term googleVision rate limit", async () => {
    await expect(
      runGoogleVisionOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => Response.json({ code: "rate_limit" }, { status: 429 }),
      }),
    ).rejects.toThrow("少し待ってから再試行");
  });

  it("sends a Firebase ID token to the googleVision proxy", async () => {
    const result = await runGoogleVisionOcr(createImageBlob(), {
      proxyUrl: "https://example.test/ocr",
      authToken: "firebase-id-token",
      fetcher: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer firebase-id-token",
        });

        return Response.json({
          provider: "googleVision",
          text: "合計\n¥481",
        });
      },
    });

    expect(result.text).toBe("合計\n¥481");
  });

  it("uses candidates from both providers through the same parser", async () => {
    const localResult = await runOcrProvider(createImageBlob(), {
      provider: "localTesseract",
      localRunner: async () => ({
        provider: "localTesseract",
        text: "サンプル店\n2026年07月01日\n合計 ¥481",
      }),
    });
    const googleResult = await runOcrProvider(createImageBlob(), {
      provider: "googleVision",
      googleVisionRunner: async () => ({
        provider: "googleVision",
        text: "サンプル店\n2026年07月01日\n合計 ¥481",
      }),
    });

    expect(parseReceiptText(localResult.text).amountCandidates[0]?.value).toBe(481);
    expect(parseReceiptText(googleResult.text).amountCandidates[0]?.value).toBe(481);
  });
});
