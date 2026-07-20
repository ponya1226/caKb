import { useCallback, useEffect, useState } from "react";
import type { SheetSyncSettings } from "../types";
import type { CloudHouseholdSummary } from "../lib/cloudHousehold";
import {
  exportExpensesToGoogleSheets,
  getConfiguredGoogleSheetsProxyUrl,
  loadSheetSyncSettings,
  type GoogleSheetsExportResult,
} from "../lib/googleSheetsSync";

export type GoogleSheetsSyncState = {
  isConfigured: boolean;
  isLoading: boolean;
  isWorking: boolean;
  settings: SheetSyncSettings | null;
  error: string | null;
  exportExpenses: (spreadsheetInput: string) => Promise<GoogleSheetsExportResult | null>;
  clearError: () => void;
};

export function useGoogleSheetsSync(
  household: CloudHouseholdSummary | null,
  getIdToken: () => Promise<string | null>,
): GoogleSheetsSyncState {
  const isOwner = household?.member.role === "owner";
  const householdId = household?.household.id;
  const isConfigured = Boolean(getConfiguredGoogleSheetsProxyUrl());
  const [settings, setSettings] = useState<SheetSyncSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    if (!householdId || !isOwner) {
      setSettings(null);
      setIsLoading(false);
      setError(null);
      return () => {
        isActive = false;
      };
    }

    setIsLoading(true);
    import("../lib/firebaseConfig")
      .then(({ getFirebaseClientServices }) => {
        const services = getFirebaseClientServices();
        return services ? loadSheetSyncSettings(services.firestore, householdId) : null;
      })
      .then((nextSettings) => {
        if (isActive) {
          setSettings(nextSettings);
        }
      })
      .catch(() => {
        if (isActive) {
          setError("Google Sheets出力設定を読み込めませんでした");
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [householdId, isOwner]);

  const exportExpenses = useCallback(async (spreadsheetInput: string) => {
    if (!householdId || !isOwner) {
      setError("Google Sheets出力はクラウド家計簿の管理者だけが実行できます");
      return null;
    }

    setIsWorking(true);
    setError(null);
    try {
      const authToken = await getIdToken();
      if (!authToken) {
        setError("Google Sheets出力にはGoogleログインが必要です");
        return null;
      }

      const result = await exportExpensesToGoogleSheets(spreadsheetInput, { authToken });
      setSettings({
        householdId,
        spreadsheetId: result.spreadsheetId,
        enabled: true,
        lastSyncedAt: result.lastSyncedAt,
        lastExportedExpenseCount: result.exportedExpenses,
        updatedAt: result.lastSyncedAt,
      });
      return result;
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Google Sheetsへの出力に失敗しました");
      return null;
    } finally {
      setIsWorking(false);
    }
  }, [getIdToken, householdId, isOwner]);

  return {
    isConfigured,
    isLoading,
    isWorking,
    settings,
    error,
    exportExpenses,
    clearError: () => setError(null),
  };
}
