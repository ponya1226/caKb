import { describe, expect, it } from "vitest";
import { resolveCloudAccessState } from "./cloudAccess";

const readyInput = {
  isOnline: true,
  isFirebaseConfigured: true,
  isAuthLoading: false,
  hasUser: true,
  isHouseholdLoading: false,
  hasHousehold: true,
  hasHouseholdError: false,
};

describe("resolveCloudAccessState", () => {
  it("requires connectivity before authentication and household access", () => {
    expect(resolveCloudAccessState({ ...readyInput, isOnline: false })).toBe("offline");
    expect(resolveCloudAccessState({ ...readyInput, isFirebaseConfigured: false })).toBe("configurationMissing");
    expect(resolveCloudAccessState({ ...readyInput, isAuthLoading: true })).toBe("checkingAuth");
    expect(resolveCloudAccessState({ ...readyInput, hasUser: false })).toBe("signedOut");
  });

  it("distinguishes household loading, failure, onboarding, and readiness", () => {
    expect(resolveCloudAccessState({ ...readyInput, isHouseholdLoading: true })).toBe("checkingHousehold");
    expect(resolveCloudAccessState({ ...readyInput, hasHousehold: false, hasHouseholdError: true })).toBe("householdError");
    expect(resolveCloudAccessState({ ...readyInput, hasHouseholdError: true })).toBe("householdError");
    expect(resolveCloudAccessState({ ...readyInput, hasHousehold: false })).toBe("householdRequired");
    expect(resolveCloudAccessState(readyInput)).toBe("ready");
  });
});
