import { describe, expect, it } from "vitest";
import { estimateBase64Bytes, parseAllowedOrigins, parseMaxImageBytes, validateOcrRequestBody } from "../src/validation.js";

describe("google vision proxy validation", () => {
  it("parses allowed origins", () => {
    expect(parseAllowedOrigins("http://localhost:5173, https://example.com ")).toEqual([
      "http://localhost:5173",
      "https://example.com",
    ]);
  });

  it("parses max image bytes with fallback", () => {
    expect(parseMaxImageBytes("1024")).toBe(1024);
    expect(parseMaxImageBytes("invalid", 512)).toBe(512);
  });

  it("estimates base64 byte length", () => {
    expect(estimateBase64Bytes("aW1hZ2U=")).toBe(5);
  });

  it("accepts valid OCR request body", () => {
    expect(validateOcrRequestBody({ imageBase64: "aW1hZ2U=", mimeType: "image/png" }, 1024)).toEqual({
      ok: true,
      value: {
        imageBase64: "aW1hZ2U=",
        mimeType: "image/png",
      },
    });
  });

  it("rejects unsupported mime type and oversized images", () => {
    expect(validateOcrRequestBody({ imageBase64: "aW1hZ2U=", mimeType: "text/plain" }, 1024)).toMatchObject({
      ok: false,
      status: 415,
    });
    expect(validateOcrRequestBody({ imageBase64: "aW1hZ2U=", mimeType: "image/png" }, 2)).toMatchObject({
      ok: false,
      status: 413,
    });
  });
});
