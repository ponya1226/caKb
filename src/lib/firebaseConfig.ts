import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { readFirebaseClientConfig, isFirebaseClientConfigured, type FirebaseEnv } from "./firebaseEnv";

export { readFirebaseClientConfig, isFirebaseClientConfigured } from "./firebaseEnv";

export type FirebaseClientServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  googleProvider: GoogleAuthProvider;
};

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
