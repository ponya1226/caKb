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

function getFirebaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function shouldFallbackToRedirect(error: unknown): boolean {
  void error;
  return false;
}

export function getSafeAuthErrorMessage(error: unknown): string {
  const code = getFirebaseErrorCode(error);

  switch (code) {
    case "auth/unauthorized-domain":
      return "ログイン元ドメインがFirebaseで許可されていません。Firebase Authenticationの承認済みドメインに ponya1226.github.io を追加してください。";
    case "auth/operation-not-allowed":
      return "Firebase AuthenticationでGoogleログインが有効になっていません。Sign-in methodのGoogleを有効化してください。";
    case "auth/popup-blocked":
      return "ブラウザにポップアップがブロックされました。GitHub Pagesではリダイレクトログインが安定しないため、ポップアップを許可してもう一度ログインしてください。";
    case "auth/operation-not-supported-in-this-environment":
      return "このブラウザ環境ではポップアップログインを開始できませんでした。通常のブラウザで開くか、ポップアップを許可してもう一度ログインしてください。";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Googleログイン画面が閉じられました。もう一度ログインしてください。";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "Firebase API keyが正しくありません。GitHub Repository VariablesのFirebase設定値を確認してください。";
    case "auth/configuration-not-found":
      return "Firebase Authentication設定が見つかりません。FirebaseプロジェクトでAuthenticationを有効化してください。";
    case "auth/network-request-failed":
      return "ネットワークエラーでログインできませんでした。通信状態を確認してもう一度試してください。";
    default:
      return code ? `ログイン処理に失敗しました。Firebase error: ${code}` : "ログイン処理に失敗しました。";
  }
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

    Promise.all([loadServices(), import("firebase/auth"), import("../lib/userProfile")])
      .then(([services, authModule, userProfileModule]) => {
        if (!isActive) {
          return;
        }

        if (!services) {
          setIsLoading(false);
          return;
        }

        authModule.setPersistence(services.auth, authModule.browserLocalPersistence).catch(() => {
          // If local persistence is unavailable, Firebase falls back to its current persistence.
        });

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

        authModule
          .getRedirectResult(services.auth)
          .then((result) => {
            if (!isActive || !result?.user) {
              return;
            }

            setUser(toAuthenticatedUser(result.user));
            return userProfileModule.upsertUserProfile(services.firestore, result.user).catch(() => {
              setError("ログインは完了しましたが、プロフィール保存に失敗しました。Firestore Rulesを確認してください。");
            });
          })
          .catch((unknownError) => {
            if (!isActive) {
              return;
            }

            setError(getSafeAuthErrorMessage(unknownError));
          });
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
      setUser(toAuthenticatedUser(credential.user));
      await upsertUserProfile(services.firestore, credential.user).catch(() => {
        setError("ログインは完了しましたが、プロフィール保存に失敗しました。Firestore Rulesを確認してください。");
      });
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
