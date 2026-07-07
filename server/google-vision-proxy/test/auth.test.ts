import { describe, expect, it } from "vitest";
import {
  isAuthEmailAllowed,
  parseAllowedAuthEmails,
  parseBearerToken,
  parseBooleanEnv,
  verifyFirebaseAuthorization,
} from "../src/auth.js";

describe("google vision proxy auth", () => {
  it("parses boolean env values", () => {
    expect(parseBooleanEnv(undefined, true)).toBe(true);
    expect(parseBooleanEnv("", false)).toBe(false);
    expect(parseBooleanEnv("true", false)).toBe(true);
    expect(parseBooleanEnv("1", false)).toBe(true);
    expect(parseBooleanEnv("false", true)).toBe(false);
  });

  it("parses bearer tokens only from Authorization headers", () => {
    expect(parseBearerToken("Bearer token-123")).toBe("token-123");
    expect(parseBearerToken("bearer token-123")).toBe("token-123");
    expect(parseBearerToken("Token token-123")).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
  });

  it("parses allowed auth emails case-insensitively", () => {
    expect([...parseAllowedAuthEmails(" USER@example.com, second@example.com ,, ")]).toEqual([
      "user@example.com",
      "second@example.com",
    ]);
  });

  it("allows all authenticated users when no email allowlist is configured", () => {
    expect(isAuthEmailAllowed(undefined, new Set())).toBe(true);
    expect(isAuthEmailAllowed("user@example.com", new Set())).toBe(true);
  });

  it("matches allowlisted auth emails case-insensitively", () => {
    const allowedEmails = parseAllowedAuthEmails("user@example.com");
    expect(isAuthEmailAllowed("USER@example.com", allowedEmails)).toBe(true);
    expect(isAuthEmailAllowed("other@example.com", allowedEmails)).toBe(false);
    expect(isAuthEmailAllowed(undefined, allowedEmails)).toBe(false);
  });

  it("accepts a valid Firebase ID token", async () => {
    await expect(
      verifyFirebaseAuthorization("Bearer valid-token", async (idToken) => ({
        uid: `uid-for-${idToken}`,
        email: "user@example.com",
      })),
    ).resolves.toEqual({ ok: true, uid: "uid-for-valid-token", email: "user@example.com" });
  });

  it("accepts only allowlisted Firebase auth emails when configured", async () => {
    const allowedEmails = parseAllowedAuthEmails("allowed@example.com");

    await expect(
      verifyFirebaseAuthorization(
        "Bearer valid-token",
        async () => ({ uid: "uid-1", email: "ALLOWED@example.com" }),
        allowedEmails,
      ),
    ).resolves.toMatchObject({ ok: true, uid: "uid-1", email: "ALLOWED@example.com" });

    await expect(
      verifyFirebaseAuthorization(
        "Bearer valid-token",
        async () => ({ uid: "uid-2", email: "other@example.com" }),
        allowedEmails,
      ),
    ).resolves.toMatchObject({ ok: false, status: 403, message: "Forbidden" });
  });

  it("rejects missing or invalid Firebase ID tokens safely", async () => {
    await expect(
      verifyFirebaseAuthorization(undefined, async () => ({ uid: "unused" })),
    ).resolves.toMatchObject({ ok: false, status: 401 });

    await expect(
      verifyFirebaseAuthorization("Bearer invalid-token", async () => {
        throw new Error("invalid");
      }),
    ).resolves.toMatchObject({ ok: false, status: 401, message: "Unauthorized" });
  });
});
