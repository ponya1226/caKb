import { describe, expect, it } from "vitest";
import { canManageBudgetSettings } from "./settingsAccess";

describe("canManageBudgetSettings", () => {
  it("shows management tools to the cloud household owner", () => {
    expect(canManageBudgetSettings(true, "owner")).toBe(true);
  });

  it("hides management tools from a cloud household member", () => {
    expect(canManageBudgetSettings(true, "member")).toBe(false);
  });

  it("keeps data tools available for device-only storage", () => {
    expect(canManageBudgetSettings(false, null)).toBe(true);
  });
});
