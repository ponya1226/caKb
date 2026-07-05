export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
};

export type FirebaseEnv = {
  VITE_FIREBASE_API_KEY: string;
  VITE_FIREBASE_AUTH_DOMAIN: string;
  VITE_FIREBASE_PROJECT_ID: string;
  VITE_FIREBASE_APP_ID: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID: string;
};

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readFirebaseClientConfig(env: Partial<FirebaseEnv> = import.meta.env as Partial<FirebaseEnv>): FirebaseClientConfig | null {
  const apiKey = normalizeEnvValue(env.VITE_FIREBASE_API_KEY);
  const authDomain = normalizeEnvValue(env.VITE_FIREBASE_AUTH_DOMAIN);
  const projectId = normalizeEnvValue(env.VITE_FIREBASE_PROJECT_ID);
  const appId = normalizeEnvValue(env.VITE_FIREBASE_APP_ID);
  const messagingSenderId = normalizeEnvValue(env.VITE_FIREBASE_MESSAGING_SENDER_ID);

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

export function isFirebaseClientConfigured(env: Partial<FirebaseEnv> = import.meta.env as Partial<FirebaseEnv>): boolean {
  return Boolean(readFirebaseClientConfig(env));
}
