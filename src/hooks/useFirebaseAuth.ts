import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { FirebaseClientServices } from "../lib/firebaseConfig";
import { isFirebaseClientConfigured } from "../lib/firebaseEnv";

export type AuthenticatedUser = {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
};

export type FirebaseAuthState = {
  isConfigured: boolean;
  isLoading: boolean;
  isWorking: boolean;
  user: AuthenticatedUser | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    uid: user.uid,
    displayName: user.displayName?.trim() || "名前未設定",
    email: user.email?.trim() || "",
    ...(user.photoURL ? { photoUrl: user.photoURL } : {}),
  };
}

function getSafeAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return "ログイン処理に失敗しました。Firebase設定とブラウザのポップアップ許可を確認してください。";
  }

  return "ログイン処理に失敗しました。";
}

export function useFirebaseAuth(): FirebaseAuthState {
  const isConfigured = isFirebaseClientConfigured();
  const servicesRef = useRef<FirebaseClientServices | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(isConfigured);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadServices = useCallback(async (): Promise<FirebaseClientServices | null> => {
    if (servicesRef.current) {
      return servicesRef.current;
    }

    const { getFirebaseClientServices } = await import("../lib/firebaseConfig");
    const services = getFirebaseClientServices();
    servicesRef.current = services;
    return services;
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return undefined;
    }

    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    Promise.all([loadServices(), import("firebase/auth")])
      .then(([services, authModule]) => {
        if (!isActive) {
          return;
        }

        if (!services) {
          setIsLoading(false);
          return;
        }

        unsubscribe = authModule.onAuthStateChanged(
          services.auth,
          (nextUser) => {
            setUser(nextUser ? toAuthenticatedUser(nextUser) : null);
            setIsLoading(false);
            setError(null);
          },
          () => {
            setIsLoading(false);
            setError("ログイン状態の確認に失敗しました。");
          },
        );
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setIsLoading(false);
        setError("Firebase Authの初期化に失敗しました。");
      });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [isConfigured, loadServices]);

  const signInWithGoogle = useCallback(async () => {
    const services = await loadServices();
    if (!services) {
      setError("Firebase設定が未設定です。");
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const [{ signInWithPopup }, { upsertUserProfile }] = await Promise.all([
        import("firebase/auth"),
        import("../lib/userProfile"),
      ]);
      const credential = await signInWithPopup(services.auth, services.googleProvider);
      await upsertUserProfile(services.firestore, credential.user);
      setUser(toAuthenticatedUser(credential.user));
    } catch (unknownError) {
      setError(getSafeAuthErrorMessage(unknownError));
    } finally {
      setIsWorking(false);
    }
  }, [loadServices]);

  const signOut = useCallback(async () => {
    const services = await loadServices();
    if (!services) {
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const { signOut: firebaseSignOut } = await import("firebase/auth");
      await firebaseSignOut(services.auth);
      setUser(null);
    } catch (unknownError) {
      setError("ログアウトに失敗しました。");
    } finally {
      setIsWorking(false);
    }
  }, [loadServices]);

  return {
    isConfigured,
    isLoading,
    isWorking,
    user,
    error,
    signInWithGoogle,
    signOut,
    clearError: () => setError(null),
  };
}
