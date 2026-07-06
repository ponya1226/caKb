import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export type AuthValidationResult =
  | { ok: true; uid: string }
  | { ok: false; status: number; message: string };

export type IdTokenVerifier = (idToken: string) => Promise<{ uid: string }>;

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

export function createFirebaseIdTokenVerifier(): IdTokenVerifier {
  if (getApps().length === 0) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    });
  }

  return async (idToken) => {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return { uid: decodedToken.uid };
  };
}

export async function verifyFirebaseAuthorization(
  authorizationHeader: string | undefined,
  verifyIdToken: IdTokenVerifier,
): Promise<AuthValidationResult> {
  const idToken = parseBearerToken(authorizationHeader);
  if (!idToken) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  try {
    return { ok: true, uid: (await verifyIdToken(idToken)).uid };
  } catch {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
}
