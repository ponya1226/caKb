import type { HouseholdRole } from "../types";

export function canManageBudgetSettings(isCloudStorage: boolean, role: HouseholdRole | null): boolean {
  return !isCloudStorage || role === "owner";
}
