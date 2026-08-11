import { describe, expect, it } from "vitest";
import { readBrowserOnlineStatus } from "./useOnlineStatus";

describe("readBrowserOnlineStatus", () => {
  it("uses the browser online flag and defaults to online during SSR", () => {
    expect(readBrowserOnlineStatus({ onLine: true })).toBe(true);
    expect(readBrowserOnlineStatus({ onLine: false })).toBe(false);
    expect(readBrowserOnlineStatus(undefined)).toBe(true);
  });
});
