import { describe, expect, it } from "vitest";
import { getSafeAuthErrorMessage, selectGoogleSignInMode, shouldFallbackToRedirect } from "./useFirebaseAuth";

describe("useFirebaseAuth helpers", () => {
  it("returns actionable messages for common Firebase Auth setup errors", () => {
    expect(getSafeAuthErrorMessage({ code: "auth/unauthorized-domain" })).toContain("ponya1226.github.io");
    expect(getSafeAuthErrorMessage({ code: "auth/unauthorized-domain" })).toContain("cakb-dev.firebaseapp.com");
    expect(getSafeAuthErrorMessage({ code: "auth/operation-not-allowed" })).toContain("Googleログイン");
    expect(getSafeAuthErrorMessage({ code: "auth/invalid-api-key" })).toContain("Firebase API key");
    expect(getSafeAuthErrorMessage({ code: "auth/configuration-not-found" })).toContain("Authentication");
  });

  it("does not start redirect fallback on GitHub Pages", () => {
    expect(shouldFallbackToRedirect({ code: "auth/popup-blocked" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/operation-not-supported-in-this-environment" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/popup-closed-by-user" })).toBe(false);
    expect(shouldFallbackToRedirect({ code: "auth/unauthorized-domain" })).toBe(false);
  });

  it("uses popup on hosts outside the Firebase auth domain", () => {
    expect(
      selectGoogleSignInMode({
        authDomain: "cakb-dev.firebaseapp.com",
        hostname: "ponya1226.github.io",
        userAgent: "iPhone",
      }),
    ).toBe("popup");
  });

  it("uses redirect for mobile or standalone sessions on the Firebase auth domain", () => {
    expect(
      selectGoogleSignInMode({
        authDomain: "cakb-dev.firebaseapp.com",
        hostname: "cakb-dev.firebaseapp.com",
        userAgent: "iPhone",
      }),
    ).toBe("redirect");

    expect(
      selectGoogleSignInMode({
        authDomain: "https://cakb-dev.firebaseapp.com",
        hostname: "cakb-dev.firebaseapp.com",
        isStandalone: true,
      }),
    ).toBe("redirect");
  });

  it("keeps popup for desktop sessions on the Firebase auth domain", () => {
    expect(
      selectGoogleSignInMode({
        authDomain: "cakb-dev.firebaseapp.com",
        hostname: "cakb-dev.firebaseapp.com",
        userAgent: "Mozilla/5.0",
      }),
    ).toBe("popup");
  });
});
