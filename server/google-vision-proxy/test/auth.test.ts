import { describe, expect, it } from "vitest";
import { parseBearerToken, parseBooleanEnv, verifyFirebaseAuthorization } from "../src/auth.js";

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

  it("accepts a valid Firebase ID token", async () => {
    await expect(
      verifyFirebaseAuthorization("Bearer valid-token", async (idToken) => ({
        uid: `uid-for-${idToken}`,
      })),
    ).resolves.toEqual({ ok: true, uid: "uid-for-valid-token" });
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
