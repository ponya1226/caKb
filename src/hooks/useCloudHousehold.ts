import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSettings, Category, Expense } from "../types";
import type { AuthenticatedUser } from "./useFirebaseAuth";
import type { FirebaseClientServices } from "../lib/firebaseConfig";
import {
  createHouseholdForUser,
  findFirstHouseholdForUser,
  migrateLocalDataToHousehold,
  type CloudHouseholdSummary,
  type CloudMigrationSummary,
} from "../lib/cloudHousehold";

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

export function useCloudHousehold(
  user: AuthenticatedUser | null,
  expenses: Expense[],
  categories: Category[],
  settings: AppSettings,
): CloudHouseholdState {
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

      setLastMigration(
        await migrateLocalDataToHousehold(
          services.firestore,
          household.household.id,
          user.uid,
          expenses,
          categories,
          settings,
        ),
      );
    } catch (unknownError) {
      setError("ローカルデータのクラウド移行に失敗しました。");
    } finally {
      setIsWorking(false);
    }
  }, [categories, expenses, getServices, household, settings, user]);

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
