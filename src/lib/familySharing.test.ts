import { describe, expect, it } from "vitest";
import { createInviteCode, normalizeInviteCode } from "./familySharing";

describe("familySharing", () => {
  it("normalizes invite codes for mobile input", () => {
    expect(normalizeInviteCode(" abcd-efgh ")).toBe("ABCDEFGH");
  });

  it("creates an eight-character code without ambiguous characters", () => {
    const code = createInviteCode(new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(code).not.toMatch(/[01IO]/);
  });
});
