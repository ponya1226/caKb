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
import {
  createHouseholdInvite,
  joinHouseholdWithInvite,
  listHouseholdMembers,
  removeHouseholdMember,
} from "../lib/familySharing";
import type { HouseholdInvite, HouseholdMember } from "../types";

export type CloudHouseholdState = {
  isLoading: boolean;
  isWorking: boolean;
  household: CloudHouseholdSummary | null;
  lastMigration: CloudMigrationSummary | null;
  members: HouseholdMember[];
  invite: HouseholdInvite | null;
  error: string | null;
  refresh: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  migrateLocalData: () => Promise<void>;
  createInvite: () => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
  clearError: () => void;
};

async function loadFirebaseServices(): Promise<FirebaseClientServices | null> {
  const { getFirebaseClientServices } = await import("../lib/firebaseConfig");
  return getFirebaseClientServices();
}

function formatFamilySharingError(unknownError: unknown): string {
  const message = unknownError instanceof Error ? unknownError.message : "";
  if (message === "invalid-invite-code" || message === "invite-not-found") {
    return "招待コードが見つかりません。入力内容を確認してください。";
  }
  if (message === "invite-used") {
    return "この招待コードは使用済みです。管理者に新しいコードを発行してもらってください。";
  }
  if (message === "invite-expired") {
    return "この招待コードは期限切れです。管理者に新しいコードを発行してもらってください。";
  }
  return "家族共有の処理に失敗しました。しばらくしてから再試行してください。";
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
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invite, setInvite] = useState<HouseholdInvite | null>(null);
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
      setMembers([]);
      setInvite(null);
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

      const nextHousehold = await findFirstHouseholdForUser(services.firestore, user.uid);
      setHousehold(nextHousehold);
      setLastMigration(nextHousehold?.lastMigration ?? null);
      setMembers(
        nextHousehold
          ? await listHouseholdMembers(services.firestore, nextHousehold.household.id).catch(() => [])
          : [],
      );
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

        const nextHousehold = await createHouseholdForUser(services.firestore, user, name);
        setHousehold(nextHousehold);
        setLastMigration(null);
        setMembers(await listHouseholdMembers(services.firestore, nextHousehold.household.id));
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

  const createInvite = useCallback(async () => {
    if (!user || !household || household.member.role !== "owner") {
      setError("招待コードの発行には管理者権限が必要です。");
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
      setInvite(await createHouseholdInvite(services.firestore, household.household.id, user.uid));
    } catch (unknownError) {
      setError(formatFamilySharingError(unknownError));
    } finally {
      setIsWorking(false);
    }
  }, [getServices, household, user]);

  const joinHousehold = useCallback(
    async (code: string) => {
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
        await joinHouseholdWithInvite(services.firestore, user, code);
        const nextHousehold = await findFirstHouseholdForUser(services.firestore, user.uid);
        setHousehold(nextHousehold);
        setLastMigration(nextHousehold?.lastMigration ?? null);
        setMembers(
          nextHousehold
            ? await listHouseholdMembers(services.firestore, nextHousehold.household.id)
            : [],
        );
      } catch (unknownError) {
        setError(formatFamilySharingError(unknownError));
      } finally {
        setIsWorking(false);
      }
    },
    [getServices, user],
  );

  const removeMember = useCallback(
    async (uid: string) => {
      if (!user || !household || household.member.role !== "owner" || uid === user.uid) {
        setError("このメンバーは解除できません。");
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
        await removeHouseholdMember(services.firestore, household.household.id, uid);
        setMembers(await listHouseholdMembers(services.firestore, household.household.id));
      } catch (unknownError) {
        setError(formatFamilySharingError(unknownError));
      } finally {
        setIsWorking(false);
      }
    },
    [getServices, household, user],
  );

  return {
    isLoading,
    isWorking,
    household,
    lastMigration,
    members,
    invite,
    error,
    refresh,
    createHousehold,
    migrateLocalData,
    createInvite,
    joinHousehold,
    removeMember,
    clearError: () => setError(null),
  };
}
