import { describe, expect, it } from "vitest";
import { runGoogleVisionOcr } from "./googleVisionOcr";
import {
  isReceiptOcrConfigured,
  runReceiptOcr,
} from "./receiptOcr";
import { parseReceiptText } from "./receiptParser";

function createImageBlob(): Blob {
  return new Blob(["image"], { type: "image/png" });
}

describe("receiptOcr", () => {
  it("passes Google Vision text to the existing receipt parser", async () => {
    const result = await runReceiptOcr(createImageBlob(), {
      proxyUrl: "https://example.test/ocr",
      fetcher: async () => Response.json({
        provider: "googleVision",
        text: "サンプルストア\n2026年07月01日\n合計 ¥1,000",
      }),
    });
    const parsed = parseReceiptText(result.text);

    expect(result.provider).toBe("googleVision");
    expect(parsed.dateCandidates[0]?.value).toBe("2026-07-01");
    expect(parsed.amountCandidates[0]?.value).toBe(1000);
  });

  it("reports receipt OCR as unavailable when the proxy URL is empty", () => {
    expect(isReceiptOcrConfigured("")).toBe(false);
    expect(isReceiptOcrConfigured("   ")).toBe(false);
  });

  it("rejects receipt OCR when the proxy URL is not configured", async () => {
    await expect(runReceiptOcr(createImageBlob(), { proxyUrl: "" })).rejects.toThrow(
      "オンライン読み取りは現在利用できません",
    );
  });

  it("returns a safe error when the proxy fails", async () => {
    await expect(
      runReceiptOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => new Response("internal", { status: 500 }),
      }),
    ).rejects.toThrow("オンラインでレシートを読み取れませんでした");
  });

  it("explains when the monthly limit is reached", async () => {
    await expect(
      runReceiptOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => Response.json({ code: "monthly_limit" }, { status: 429 }),
      }),
    ).rejects.toThrow("今月のレシート読み取り回数が上限に達しました");
  });

  it("asks the user to wait after a short-term rate limit", async () => {
    await expect(
      runReceiptOcr(createImageBlob(), {
        proxyUrl: "https://example.test/ocr",
        fetcher: async () => Response.json({ code: "rate_limit" }, { status: 429 }),
      }),
    ).rejects.toThrow("少し待ってからもう一度お試しください");
  });

  it("sends a Firebase ID token and keeps word positions", async () => {
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
          blocks: [{
            text: "¥481",
            granularity: "word",
            boundingBox: { x: 120, y: 80, width: 40, height: 18 },
          }],
        });
      },
    });

    expect(result.text).toBe("合計\n¥481");
    expect(result.blocks).toEqual([{
      text: "¥481",
      granularity: "word",
      boundingBox: { x: 120, y: 80, width: 40, height: 18 },
    }]);
  });
});
