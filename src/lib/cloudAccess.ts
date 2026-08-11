export type CloudAccessState =
  | "offline"
  | "configurationMissing"
  | "checkingAuth"
  | "signedOut"
  | "checkingHousehold"
  | "householdError"
  | "householdRequired"
  | "ready";

type CloudAccessInput = {
  isOnline: boolean;
  isFirebaseConfigured: boolean;
  isAuthLoading: boolean;
  hasUser: boolean;
  isHouseholdLoading: boolean;
  hasHousehold: boolean;
  hasHouseholdError: boolean;
};

export function resolveCloudAccessState(input: CloudAccessInput): CloudAccessState {
  if (!input.isOnline) {
    return "offline";
  }
  if (!input.isFirebaseConfigured) {
    return "configurationMissing";
  }
  if (input.isAuthLoading) {
    return "checkingAuth";
  }
  if (!input.hasUser) {
    return "signedOut";
  }
  if (input.isHouseholdLoading) {
    return "checkingHousehold";
  }
  if (input.hasHouseholdError) {
    return "householdError";
  }
  if (!input.hasHousehold) {
    return "householdRequired";
  }
  return "ready";
}
