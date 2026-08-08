import { describe, expect, it } from "vitest";
import type { protos } from "@google-cloud/vision";
import { extractWordBlocks, toBoundingBox } from "../src/ocrBlocks.js";

describe("ocrBlocks", () => {
  it("converts Vision word annotations to positioned word blocks", () => {
    const response = {
      fullTextAnnotation: {
        pages: [{
          blocks: [{
            paragraphs: [{
              words: [
                {
                  symbols: [{ text: "商品" }, { text: "A" }],
                  boundingBox: { vertices: [{ x: 10, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 40 }, { x: 10, y: 40 }] },
                },
                {
                  symbols: [{ text: "¥" }, { text: "1" }, { text: "5" }, { text: "9" }],
                  boundingBox: { vertices: [{ x: 180, y: 20 }, { x: 230, y: 20 }, { x: 230, y: 40 }, { x: 180, y: 40 }] },
                },
              ],
            }],
          }],
        }],
      },
    } as protos.google.cloud.vision.v1.IAnnotateImageResponse;

    expect(extractWordBlocks(response)).toEqual([
      {
        text: "商品A",
        granularity: "word",
        boundingBox: { x: 10, y: 20, width: 50, height: 20 },
      },
      {
        text: "¥159",
        granularity: "word",
        boundingBox: { x: 180, y: 20, width: 50, height: 20 },
      },
    ]);
  });

  it("treats omitted protobuf coordinates as zero", () => {
    expect(toBoundingBox([{}, { x: 40 }, { x: 40, y: 20 }, { y: 20 }])).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    });
  });
});
