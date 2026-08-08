import { describe, expect, it } from "vitest";
import { findEntryScriptUrl, hasEntryScriptChanged } from "./appUpdate";

describe("appUpdate", () => {
  const pageUrl = "https://example.test/app/";

  it("finds the Vite module entry regardless of other script attributes", () => {
    const html = '<script crossorigin type="module" src="./assets/index-new.js"></script>';

    expect(findEntryScriptUrl(html, pageUrl)).toBe("https://example.test/app/assets/index-new.js");
  });

  it("detects a newly deployed entry script", () => {
    const html = '<script type="module" crossorigin src="./assets/index-new.js"></script>';

    expect(hasEntryScriptChanged("https://example.test/app/assets/index-old.js", html, pageUrl)).toBe(true);
    expect(hasEntryScriptChanged("https://example.test/app/assets/index-new.js", html, pageUrl)).toBe(false);
  });

  it("does not report an update when the entry script cannot be found", () => {
    expect(hasEntryScriptChanged("https://example.test/app/assets/index.js", "<main></main>", pageUrl)).toBe(false);
  });
});
