import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrProviderRunResult } from "./ocrProviders";
import { runOcrProvider } from "./ocrProviders";
import { FULL_OCR_CROP, runOcrWithRangeMode } from "./ocrRange";

vi.mock("./ocrProviders", () => ({
  runOcrProvider: vi.fn(),
}));

const mockedRunOcrProvider = vi.mocked(runOcrProvider);

function createImageBlob(): Blob {
  return new Blob(["image"], { type: "image/png" });
}

describe("ocrRange", () => {
  beforeEach(() => {
    mockedRunOcrProvider.mockReset();
  });

  it("uses the full image as the googleVision OCR range", async () => {
    const googleVisionResult: OcrProviderRunResult = {
      provider: "googleVision",
      text: "合計\n¥170",
    };
    mockedRunOcrProvider.mockResolvedValueOnce(googleVisionResult);

    const result = await runOcrWithRangeMode(createImageBlob(), {
      provider: "googleVision",
      mode: "manual",
      crop: { top: 12, right: 8, bottom: 20, left: 6 },
      presetLabel: "手動補正",
      preprocess: true,
      preprocessMode: "bold",
      onProgress: vi.fn(),
    });

    expect(mockedRunOcrProvider).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ provider: "googleVision" }),
    );
    expect(result.crop).toEqual(FULL_OCR_CROP);
    expect(result.presetLabel).toBe("全体");
    expect(result.preprocess).toBe(false);
  });
});
