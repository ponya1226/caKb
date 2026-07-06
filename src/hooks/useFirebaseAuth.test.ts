import { describe, expect, it } from "vitest";
import { getSafeAuthErrorMessage, shouldFallbackToRedirect } from "./useFirebaseAuth";

describe("useFirebaseAuth helpers", () => {
  it("returns actionable messages for common Firebase Auth setup errors", () => {
    expect(getSafeAuthErrorMessage({ code: "auth/unauthorized-domain" })).toContain("ponya1226.github.io");
    expect(getSafeAuthErrorMessage({ code: "auth/operation-not-allowed" })).toContain("Googleログイン");
    expect(getSafeAuthErrorMessage({ code: "auth/invalid-api-key" })).toContain("Firebase API key");
    expect(getSafeAuthErrorMessage({ code: "auth/configuration-not-found" })).toContain("Authentication");
  });

  it("falls back to redirect only when popup login cannot be used", () => {
    expect(shouldFallbackToRedirect({ code: "auth/popup-blocked" })).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/operation-not-supported-in-this-environment" })).toBe(true);
    expect(shouldFallbackToRedirect({ code: "auth/popup-closed-by-user" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/unauthorized-domain" })).toBe(false);
  });
});
