import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthenticatedUser } from "./useFirebaseAuth";
import type { FirebaseClientServices } from "../lib/firebaseConfig";
import {
  createHouseholdForUser,
  findFirstHouseholdForUser,
  getHouseholdCreationAuthorization,
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
  isHouseholdCreationAuthorized: boolean;
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
    return "この家計簿へ保存する権限がありません。ログイン状態と参加状況を確認してください。";
  }

  if (message.includes("Unsupported field value: undefined")) {
    return "クラウド移行用に変換できないデータが含まれています。画面を再読み込みしてからもう一度実行してください。";
  }

  return "この端末のデータをクラウドへコピーできませんでした。通信状態を確認して、もう一度お試しください。";
}

export function useCloudHousehold(user: AuthenticatedUser | null, enabled = true): CloudHouseholdState {
  const servicesRef = useRef<FirebaseClientServices | null>(null);
  const activeUserUidRef = useRef<string | null>(user?.uid ?? null);
  const [household, setHousehold] = useState<CloudHouseholdSummary | null>(null);
  const [lastMigration, setLastMigration] = useState<CloudMigrationSummary | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invite, setInvite] = useState<HouseholdInvite | null>(null);
  const [creationAuthorized, setCreationAuthorized] = useState(false);
  const [authorizedHouseholdId, setAuthorizedHouseholdId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user && enabled));
  const [resolvedUserUid, setResolvedUserUid] = useState<string | null>(null);
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
      setCreationAuthorized(false);
      setAuthorizedHouseholdId(null);
      setIsLoading(false);
      setResolvedUserUid(null);
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

      const nextHousehold = await findFirstHouseholdForUser(services.firestore, user);
      const creationAuthorization = nextHousehold
        ? null
        : await getHouseholdCreationAuthorization(services.firestore, user.uid);
      setHousehold(nextHousehold);
      setCreationAuthorized(Boolean(creationAuthorization));
      setAuthorizedHouseholdId(creationAuthorization?.householdId ?? null);
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
      setResolvedUserUid(user.uid);
    }
  }, [getServices, user]);

  useEffect(() => {
    if (!user) {
      activeUserUidRef.current = null;
      setHousehold(null);
      setLastMigration(null);
      setMembers([]);
      setInvite(null);
      setCreationAuthorized(false);
      setAuthorizedHouseholdId(null);
      setIsLoading(false);
      setResolvedUserUid(null);
      setError(null);
      return;
    }
    if (activeUserUidRef.current !== user.uid) {
      activeUserUidRef.current = user.uid;
      setHousehold(null);
      setLastMigration(null);
      setMembers([]);
      setInvite(null);
      setCreationAuthorized(false);
      setAuthorizedHouseholdId(null);
      setResolvedUserUid(null);
      setError(null);
    }
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh, user]);

  const createHousehold = useCallback(
    async (name: string) => {
      if (!user) {
        setError("ログインが必要です。");
        return;
      }
      if (!creationAuthorized || !authorizedHouseholdId) {
        setError("家計簿の新規作成は管理者による初期設定時だけ利用できます。招待コードで参加してください。");
        return;
      }

      setIsWorking(true);
      setError(null);
      try {
        const services = await getServices();
        if (!services) {
          setError("クラウド機能は現在利用できません。");
          return;
        }

        const nextHousehold = await createHouseholdForUser(
          services.firestore,
          user,
          name,
          authorizedHouseholdId,
        );
        setHousehold(nextHousehold);
        setLastMigration(null);
        setMembers(await listHouseholdMembers(services.firestore, nextHousehold.household.id));
        setCreationAuthorized(false);
        setAuthorizedHouseholdId(null);
      } catch (unknownError) {
        setError("クラウド家計簿の作成に失敗しました。");
      } finally {
        setIsWorking(false);
      }
    },
    [authorizedHouseholdId, creationAuthorized, getServices, user],
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
        setError("クラウド機能は現在利用できません。");
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
        setError("クラウド機能は現在利用できません。");
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
          setError("クラウド機能は現在利用できません。");
          return;
        }
        await joinHouseholdWithInvite(services.firestore, user, code);
        const nextHousehold = await findFirstHouseholdForUser(services.firestore, user);
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
          setError("クラウド機能は現在利用できません。");
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
    isLoading: isLoading || Boolean(user && enabled && resolvedUserUid !== user.uid),
    isWorking,
    household,
    lastMigration,
    members,
    invite,
    isHouseholdCreationAuthorized: creationAuthorized,
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
