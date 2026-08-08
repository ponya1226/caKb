import type { protos } from "@google-cloud/vision";

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrWordBlock = {
  text: string;
  granularity: "word";
  boundingBox?: BoundingBox;
};

export function toBoundingBox(
  vertices: protos.google.cloud.vision.v1.IVertex[] | null | undefined,
): BoundingBox | undefined {
  if (!vertices || vertices.length === 0) {
    return undefined;
  }

  const points = vertices.map((vertex) => ({
    x: typeof vertex.x === "number" ? vertex.x : 0,
    y: typeof vertex.y === "number" ? vertex.y : 0,
  }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function getWordText(word: protos.google.cloud.vision.v1.IWord): string {
  return (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim();
}

export function extractWordBlocks(
  response: protos.google.cloud.vision.v1.IAnnotateImageResponse,
): OcrWordBlock[] {
  return (response.fullTextAnnotation?.pages ?? [])
    .flatMap((page) => page.blocks ?? [])
    .flatMap((block) => block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.words ?? [])
    .map((word) => ({
      text: getWordText(word),
      granularity: "word" as const,
      boundingBox: toBoundingBox(word.boundingBox?.vertices),
    }))
    .filter((block) => block.text.length > 0)
    .map((block) => ({
      text: block.text,
      granularity: block.granularity,
      ...(block.boundingBox ? { boundingBox: block.boundingBox } : {}),
    }));
}
