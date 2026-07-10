import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthenticatedUser } from "./useFirebaseAuth";
import type { FirebaseClientServices } from "../lib/firebaseConfig";
import {
  createHouseholdForUser,
  findFirstHouseholdForUser,
  migrateLocalDataToHousehold,
  type CloudHouseholdSummary,
  type CloudMigrationSummary,
} from "../lib/cloudHousehold";
import { localBudgetRepository } from "../lib/repositories/localBudgetRepository";
import { loadSettings } from "../lib/settings";

export type CloudHouseholdState = {
  isLoading: boolean;
  isWorking: boolean;
  household: CloudHouseholdSummary | null;
  lastMigration: CloudMigrationSummary | null;
  error: string | null;
  refresh: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  migrateLocalData: () => Promise<void>;
  clearError: () => void;
};

async function loadFirebaseServices(): Promise<FirebaseClientServices | null> {
  const { getFirebaseClientServices } = await import("../lib/firebaseConfig");
  return getFirebaseClientServices();
}

function formatCloudMigrationError(unknownError: unknown): string {
  const error = unknownError instanceof Error ? unknownError : null;
  const message = error?.message ?? "";
  const code = typeof unknownError === "object" && unknownError && "code" in unknownError ? unknownError.code : null;

  if (code === "permission-denied") {
    return "Firestoreへの書き込み権限がありません。ログイン状態とクラウド家計簿の権限を確認してください。";
  }

  if (message.includes("Unsupported field value: undefined")) {
    return "クラウド移行用に変換できないデータが含まれています。画面を再読み込みしてからもう一度実行してください。";
  }

  return typeof code === "string"
    ? `ローカルデータのクラウド移行に失敗しました。エラーコード: ${code}`
    : "ローカルデータのクラウド移行に失敗しました。";
}

export function useCloudHousehold(user: AuthenticatedUser | null): CloudHouseholdState {
  const servicesRef = useRef<FirebaseClientServices | null>(null);
  const [household, setHousehold] = useState<CloudHouseholdSummary | null>(null);
  const [lastMigration, setLastMigration] = useState<CloudMigrationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getServices = useCallback(async () => {
    if (servicesRef.current) {
      return servicesRef.current;
    }

    servicesRef.current = await loadFirebaseServices();
    return servicesRef.current;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const services = await getServices();
      if (!services) {
        setHousehold(null);
        return;
      }

      setHousehold(await findFirstHouseholdForUser(services.firestore, user.uid));
    } catch (unknownError) {
      setError("クラウド家計簿の確認に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, [getServices, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createHousehold = useCallback(
    async (name: string) => {
      if (!user) {
        setError("ログインが必要です。");
        return;
      }

      setIsWorking(true);
      setError(null);
      try {
        const services = await getServices();
        if (!services) {
          setError("Firebase設定が未設定です。");
          return;
        }

        setHousehold(await createHouseholdForUser(services.firestore, user, name));
      } catch (unknownError) {
        setError("クラウド家計簿の作成に失敗しました。");
      } finally {
        setIsWorking(false);
      }
    },
    [getServices, user],
  );

  const migrateLocalData = useCallback(async () => {
    if (!user || !household) {
      setError("ログインとクラウド家計簿の作成が必要です。");
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const services = await getServices();
      if (!services) {
        setError("Firebase設定が未設定です。");
        return;
      }

      await localBudgetRepository.initialize();
      const localSnapshot = await localBudgetRepository.getSnapshot();
      setLastMigration(
        await migrateLocalDataToHousehold(
          services.firestore,
          household.household.id,
          user.uid,
          localSnapshot.expenses,
          localSnapshot.categories,
          loadSettings(),
        ),
      );
    } catch (unknownError) {
      setError(formatCloudMigrationError(unknownError));
    } finally {
      setIsWorking(false);
    }
  }, [getServices, household, user]);

  return {
    isLoading,
    isWorking,
    household,
    lastMigration,
    error,
    refresh,
    createHousehold,
    migrateLocalData,
    clearError: () => setError(null),
  };
}
