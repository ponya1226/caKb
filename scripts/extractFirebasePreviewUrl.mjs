import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HOSTING_URL_PATTERN = /https:\/\/[^\s\"'<>]+/g;

function collectHostingUrls(value, urls) {
  if (typeof value === "string") {
    for (const match of value.matchAll(HOSTING_URL_PATTERN)) {
      try {
        const url = new URL(match[0]);
        if (url.protocol === "https:" && (url.hostname.endsWith(".web.app") || url.hostname.endsWith(".firebaseapp.com"))) {
          urls.add(url.toString().replace(/\/$/, ""));
        }
      } catch {
        // Ignore non-URL strings in Firebase CLI metadata.
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectHostingUrls(item, urls);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectHostingUrls(item, urls);
    }
  }
}

export function extractFirebasePreviewUrl(payload, channelId = "staging") {
  const urls = new Set();
  collectHostingUrls(payload, urls);
  const candidates = [...urls];
  const channelMarker = `--${channelId.toLowerCase()}-`;
  const channelUrl = candidates.find((url) => new URL(url).hostname.toLowerCase().includes(channelMarker));

  if (channelUrl) {
    return channelUrl;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  throw new Error(`Firebase preview URL for channel "${channelId}" was not found.`);
}

function runCli() {
  const [, , jsonPath, channelId = "staging"] = process.argv;
  if (!jsonPath) {
    throw new Error("Usage: node scripts/extractFirebasePreviewUrl.mjs <firebase-json> [channel-id]");
  }

  const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
  process.stdout.write(extractFirebasePreviewUrl(payload, channelId));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
