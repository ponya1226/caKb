import vision, { protos } from "@google-cloud/vision";
import cors from "cors";
import express from "express";
import {
  createFirebaseIdTokenVerifier,
  parseAllowedAuthEmails,
  parseBooleanEnv,
  verifyFirebaseAuthorization,
} from "./auth.js";
import { parseAllowedOrigins, parseMaxImageBytes, validateOcrRequestBody } from "./validation.js";

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OcrTextBlock = {
  text: string;
  boundingBox?: BoundingBox;
};

const app = express();
const port = Number(process.env.PORT ?? 8080);
const maxImageBytes = parseMaxImageBytes(process.env.MAX_IMAGE_BYTES);
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGINS);
const sharedToken = process.env.OCR_SHARED_TOKEN?.trim();
const requireFirebaseAuth = parseBooleanEnv(process.env.REQUIRE_FIREBASE_AUTH, true);
const allowedAuthEmails = parseAllowedAuthEmails(process.env.ALLOWED_AUTH_EMAILS);
const verifyIdToken = requireFirebaseAuth ? createFirebaseIdTokenVerifier() : null;
const visionClient = new vision.ImageAnnotatorClient();

app.use(express.json({ limit: `${Math.ceil(maxImageBytes * 1.4)}b` }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"));
  },
}));

function toBoundingBox(vertices: protos.google.cloud.vision.v1.IVertex[] | null | undefined): BoundingBox | undefined {
  const points = (vertices ?? []).filter((vertex) => typeof vertex.x === "number" && typeof vertex.y === "number");
  if (points.length === 0) {
    return undefined;
  }

  const xs = points.map((point) => point.x ?? 0);
  const ys = points.map((point) => point.y ?? 0);
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

function blockText(block: protos.google.cloud.vision.v1.IBlock): string {
  return (block.paragraphs ?? [])
    .flatMap((paragraph) => paragraph.words ?? [])
    .map((word) => (word.symbols ?? []).map((symbol) => symbol.text ?? "").join(""))
    .filter(Boolean)
    .join(" ");
}

function extractBlocks(response: protos.google.cloud.vision.v1.IAnnotateImageResponse): OcrTextBlock[] {
  return (response.fullTextAnnotation?.pages ?? [])
    .flatMap((page) => page.blocks ?? [])
    .map((block) => ({
      text: blockText(block),
      boundingBox: toBoundingBox(block.boundingBox?.vertices),
    }))
    .filter((block) => block.text.trim().length > 0);
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/ocr", async (request, response) => {
  if (sharedToken && request.header("X-caKb-OCR-Token") !== sharedToken) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (verifyIdToken) {
    const authValidation = await verifyFirebaseAuthorization(
      request.header("Authorization"),
      verifyIdToken,
      allowedAuthEmails,
    );
    if (!authValidation.ok) {
      response.status(authValidation.status).json({ error: authValidation.message });
      return;
    }
  }

  const validation = validateOcrRequestBody(request.body, maxImageBytes);
  if (!validation.ok) {
    response.status(validation.status).json({ error: validation.message });
    return;
  }

  try {
    const [result] = await visionClient.documentTextDetection({
      image: {
        content: validation.value.imageBase64,
      },
    });
    const text = result.fullTextAnnotation?.text ?? result.textAnnotations?.[0]?.description ?? "";

    response.json({
      provider: "googleVision",
      text,
      blocks: extractBlocks(result),
    });
  } catch {
    response.status(502).json({ error: "Google Vision OCR failed" });
  }
});

app.listen(port, () => {
  console.info(`caKb Google Vision OCR proxy listening on port ${port}`);
});
