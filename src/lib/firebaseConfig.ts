import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export type FirebaseClientServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  googleProvider: GoogleAuthProvider;
};

type FirebaseEnv = Pick<
  ImportMetaEnv,
  | "VITE_FIREBASE_API_KEY"
  | "VITE_FIREBASE_AUTH_DOMAIN"
  | "VITE_FIREBASE_PROJECT_ID"
  | "VITE_FIREBASE_APP_ID"
  | "VITE_FIREBASE_MESSAGING_SENDER_ID"
>;

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readFirebaseClientConfig(env: Partial<FirebaseEnv> = import.meta.env as Partial<FirebaseEnv>): FirebaseOptions | null {
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

export function getFirebaseClientServices(env: Partial<FirebaseEnv> = import.meta.env as Partial<FirebaseEnv>): FirebaseClientServices | null {
  const config = readFirebaseClientConfig(env);
  if (!config) {
    return null;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });

  return {
    app,
    auth: getAuth(app),
    firestore: getFirestore(app),
    googleProvider,
  };
}
