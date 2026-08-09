import test from "node:test";
import assert from "node:assert/strict";
import { extractFirebasePreviewUrl } from "../../scripts/extractFirebasePreviewUrl.mjs";

test("対象channelのpreview URLをネストしたJSONから取得する", () => {
  const payload = {
    status: "success",
    result: {
      liveUrl: "https://cakb-dev.web.app",
      channels: [
        {
          id: "staging",
          url: "https://cakb-dev--staging-example.web.app",
        },
      ],
    },
  };

  assert.equal(extractFirebasePreviewUrl(payload), "https://cakb-dev--staging-example.web.app");
});

test("URLが1件だけならFirebase CLIのメッセージ文字列から取得する", () => {
  const payload = {
    result: "Preview URL: https://cakb-dev--preview-example.web.app/",
  };

  assert.equal(
    extractFirebasePreviewUrl(payload, "preview"),
    "https://cakb-dev--preview-example.web.app",
  );
});

test("対象を特定できない複数URLでは失敗する", () => {
  const payload = {
    urls: ["https://cakb-dev.web.app", "https://cakb-dev.firebaseapp.com"],
  };

  assert.throws(() => extractFirebasePreviewUrl(payload), /was not found/);
});
