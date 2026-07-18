import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export type AuthValidationResult =
  | { ok: true; uid: string; email?: string }
  | { ok: false; status: number; message: string };

export type VerifiedIdToken = {
  uid: string;
  email?: string;
};

export type IdTokenVerifier = (idToken: string) => Promise<VerifiedIdToken>;
export type HouseholdMembershipChecker = (uid: string) => Promise<boolean>;

export type FirebaseAuthorizationOptions = {
  allowedEmails?: ReadonlySet<string>;
  requireHouseholdMembership?: boolean;
  checkHouseholdMembership?: HouseholdMembershipChecker;
};

export function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(normalizedValue);
}

export function parseBearerToken(value: string | undefined): string | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(trimmedValue);
  return match?.[1]?.trim() || null;
}

export function parseAllowedAuthEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAuthEmailAllowed(email: string | undefined, allowedEmails: ReadonlySet<string>): boolean {
  if (allowedEmails.size === 0) {
    return true;
  }

  return Boolean(email && allowedEmails.has(email.trim().toLowerCase()));
}

function ensureFirebaseAdminApp(): void {
  if (getApps().length === 0) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    });
  }
}

export function createFirebaseIdTokenVerifier(): IdTokenVerifier {
  ensureFirebaseAdminApp();

  return async (idToken) => {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return { uid: decodedToken.uid, email: decodedToken.email };
  };
}

export function createHouseholdMembershipChecker(): HouseholdMembershipChecker {
  ensureFirebaseAdminApp();

  return async (uid) => {
    const firestore = getFirestore();
    const userSnapshot = await firestore.doc(`users/${uid}`).get();
    const activeHouseholdId = userSnapshot.data()?.activeHouseholdId;
    if (typeof activeHouseholdId !== "string" || !activeHouseholdId.trim()) {
      return false;
    }

    const memberSnapshot = await firestore.doc(`households/${activeHouseholdId}/members/${uid}`).get();
    if (!memberSnapshot.exists) {
      return false;
    }

    const member = memberSnapshot.data();
    return member?.uid === uid && member.householdId === activeHouseholdId;
  };
}

export async function verifyFirebaseAuthorization(
  authorizationHeader: string | undefined,
  verifyIdToken: IdTokenVerifier,
  options: FirebaseAuthorizationOptions = {},
): Promise<AuthValidationResult> {
  const idToken = parseBearerToken(authorizationHeader);
  if (!idToken) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  try {
    const verifiedToken = await verifyIdToken(idToken);
    const allowedEmails = options.allowedEmails ?? new Set<string>();
    if (!isAuthEmailAllowed(verifiedToken.email, allowedEmails)) {
      return { ok: false, status: 403, message: "Forbidden" };
    }

    if (options.requireHouseholdMembership) {
      if (!options.checkHouseholdMembership) {
        return { ok: false, status: 403, message: "Forbidden" };
      }

      try {
        if (!(await options.checkHouseholdMembership(verifiedToken.uid))) {
          return { ok: false, status: 403, message: "Forbidden" };
        }
      } catch {
        return { ok: false, status: 403, message: "Forbidden" };
      }
    }

    return { ok: true, uid: verifiedToken.uid, email: verifiedToken.email };
  } catch {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
}
