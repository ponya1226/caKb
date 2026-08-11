import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CalendarDays, Camera, CircleUserRound, Cloud, Home, List, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { CloudAccessScreen, CloudConnectionRequiredScreen } from "./components/CloudAccessScreen";
import { ExpenseEditor } from "./components/ExpenseEditor";
import { ReceiptAutoSaveNotice } from "./components/ReceiptAutoSaveNotice";
import { useBudgetData } from "./hooks/useBudgetData";
import { useCloudHousehold } from "./hooks/useCloudHousehold";
import { useFirebaseAuth } from "./hooks/useFirebaseAuth";
import { useGoogleSheetsSync } from "./hooks/useGoogleSheetsSync";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { usePendingReceiptReviews } from "./hooks/usePendingReceiptReviews";
import { useReceiptQualityMetrics } from "./hooks/useReceiptQualityMetrics";
import { normalizeShopNameForCategory } from "./lib/categorySuggestion";
import { resolveCloudAccessState } from "./lib/cloudAccess";
import { getFirebaseClientServices } from "./lib/firebaseConfig";
import { isReceiptOcrConfigured } from "./lib/receiptOcr";
import { normalizeReceiptQualityPolicyVersion } from "./lib/receiptQualityMetrics";
import { createFirestoreBudgetRepository } from "./lib/repositories/firestoreBudgetRepository";
import type { Expense, ExpenseFormValues, ReceiptDraft, ReceiptReviewCause, ReceiptSaveOptions } from "./types";

type View = "dashboard" | "expenses" | "yearly" | "receipt" | "confirm" | "settings";

const DashboardScreen = lazy(() =>
  import("./components/DashboardScreen").then((module) => ({ default: module.DashboardScreen })),
);
const ExpenseListScreen = lazy(() =>
  import("./components/ExpenseListScreen").then((module) => ({ default: module.ExpenseListScreen })),
);
const YearlyExpenseScreen = lazy(() =>
  import("./components/YearlyExpenseScreen").then((module) => ({ default: module.YearlyExpenseScreen })),
);
const ReceiptCaptureScreen = lazy(() =>
  import("./components/ReceiptCaptureScreen").then((module) => ({ default: module.ReceiptCaptureScreen })),
);
const OcrConfirmScreen = lazy(() =>
  import("./components/OcrConfirmScreen").then((module) => ({ default: module.OcrConfirmScreen })),
);
const SettingsScreen = lazy(() =>
  import("./components/SettingsScreen").then((module) => ({ default: module.SettingsScreen })),
);

const navItems: Array<{ view: View; label: string; icon: typeof Home }> = [
  { view: "dashboard", label: "ホーム", icon: Home },
  { view: "expenses", label: "一覧", icon: List },
  { view: "yearly", label: "年間", icon: CalendarDays },
  { view: "receipt", label: "レシート", icon: Camera },
  { view: "settings", label: "アカウント", icon: CircleUserRound },
];

const AUTO_SAVE_UNDO_WINDOW_MS = 10_000;

type RecentAutoSave = {
  expense: Expense;
  expiresAt: number;
  qualityPolicyVersion: string;
  qualityScopeKey: string;
};

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [receiptDrafts, setReceiptDrafts] = useState<ReceiptDraft[]>([]);
  const [receiptBatchTotal, setReceiptBatchTotal] = useState(0);
  const [initialReceiptFiles, setInitialReceiptFiles] = useState<File[] | null>(null);
  const [recentAutoSave, setRecentAutoSave] = useState<RecentAutoSave | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [isUndoingAutoSave, setIsUndoingAutoSave] = useState(false);
  const [isManualQuickAddOpen, setIsManualQuickAddOpen] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const firebaseAuth = useFirebaseAuth();
  const isOnline = useOnlineStatus();
  const cloudHousehold = useCloudHousehold(firebaseAuth.user, isOnline);
  const googleSheetsSync = useGoogleSheetsSync(cloudHousehold.household, firebaseAuth.getIdToken);
  const pendingReceiptReviews = usePendingReceiptReviews(cloudHousehold.household?.household.id ?? null);
  const receiptQualityMetrics = useReceiptQualityMetrics(cloudHousehold.household?.household.id ?? null);
  const cloudBudgetRepository = useMemo(() => {
    const householdId = cloudHousehold.household?.household.id;
    if (!firebaseAuth.user || !householdId) {
      return null;
    }

    const services = getFirebaseClientServices();
    if (!services) {
      return null;
    }

    return createFirestoreBudgetRepository(services.firestore, householdId, firebaseAuth.user.uid);
  }, [cloudHousehold.household?.household.id, firebaseAuth.user]);
  const cloudAccessState = resolveCloudAccessState({
    isOnline,
    isFirebaseConfigured: firebaseAuth.isConfigured,
    isAuthLoading: firebaseAuth.isLoading,
    hasUser: Boolean(firebaseAuth.user),
    isHouseholdLoading: cloudHousehold.isLoading,
    hasHousehold: Boolean(cloudHousehold.household),
    hasHouseholdError: Boolean(cloudHousehold.error),
  });
  const isCloudReady = cloudAccessState === "ready" && Boolean(cloudBudgetRepository);
  const budgetData = useBudgetData({
    repository: cloudBudgetRepository ?? undefined,
    storageMode: "cloud",
    enabled: isCloudReady,
  });
  const canUseReceiptOcr = cloudAccessState === "ready"
    && budgetData.cloudConnection?.status === "online"
    && isReceiptOcrConfigured();
  const activeHouseholdName = cloudHousehold.household?.household.name;
  const cloudConnection = budgetData.cloudConnection;
  const householdMemberNameMap = useMemo(() => {
    const entries = cloudHousehold.members.map((member) => [
      member.uid,
      member.displayName?.trim() || member.email?.trim() || "名前未設定",
    ] as const);
    if (firebaseAuth.user && !entries.some(([uid]) => uid === firebaseAuth.user?.uid)) {
      entries.push([firebaseAuth.user.uid, firebaseAuth.user.displayName]);
    }
    return new Map(entries);
  }, [cloudHousehold.members, firebaseAuth.user]);
  const receiptDraft = receiptDrafts[0] ?? null;
  const receiptQueuePosition = receiptDraft
    ? {
        current: Math.max(1, receiptBatchTotal - receiptDrafts.length + 1),
        total: receiptBatchTotal || receiptDrafts.length,
      }
    : null;

  useEffect(() => {
    const handleUpdateAvailable = () => setIsUpdateAvailable(true);
    window.addEventListener("cakb:update-available", handleUpdateAvailable);
    return () => window.removeEventListener("cakb:update-available", handleUpdateAvailable);
  }, []);

  useEffect(() => {
    if (!recentAutoSave) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentAutoSave((current) => current?.expense.id === recentAutoSave.expense.id ? null : current);
      setUndoError(null);
    }, Math.max(0, recentAutoSave.expiresAt - Date.now()));
    return () => window.clearTimeout(timeoutId);
  }, [recentAutoSave]);

  function revokeReceiptDraftUrls(drafts: ReceiptDraft[]) {
    drafts.forEach((draft) => {
      URL.revokeObjectURL(draft.imagePreviewUrl);
    });
  }

  function applySavedCategoryToQueue(drafts: ReceiptDraft[], values: ExpenseFormValues): ReceiptDraft[] {
    const savedShopName = normalizeShopNameForCategory(values.shopName);
    if (!savedShopName) {
      return drafts;
    }

    return drafts.map((draft) => {
      if (normalizeShopNameForCategory(draft.initialValues.shopName) !== savedShopName) {
        return draft;
      }

      return {
        ...draft,
        categorySuggestion: {
          categoryId: values.categoryId,
          matchedShopName: values.shopName,
          source: "rule",
        },
        initialValues: {
          ...draft.initialValues,
          categoryId: values.categoryId,
        },
      };
    });
  }

  async function handleSaveReceiptExpense(values: ExpenseFormValues, options?: ReceiptSaveOptions) {
    if (!receiptDraft) {
      return;
    }

    const remainingDrafts = applySavedCategoryToQueue(receiptDrafts.slice(1), values);
    if (options?.saveCategoryRule) {
      await budgetData.upsertShopCategoryRule(values.shopName, values.categoryId);
    }
    if (receiptDraft.pendingReviewId) {
      await pendingReceiptReviews.removeReviews([receiptDraft.pendingReviewId]);
    }
    try {
      await budgetData.addReceiptExpense(values, {
        imageBlob: receiptDraft.imageFile,
        ocrText: receiptDraft.ocrText,
      });
    } catch (unknownError) {
      if (receiptDraft.pendingReviewId) {
        await pendingReceiptReviews.persistDrafts([receiptDraft]).catch(() => undefined);
      }
      throw unknownError;
    }
    receiptQualityMetrics.recordReviewSaved(
      receiptDraft.confidenceAssessment,
      receiptDraft.initialValues.amount !== values.amount,
    );
    let nextRemainingDrafts = remainingDrafts;
    if (remainingDrafts.some((draft) => draft.pendingReviewId)) {
      try {
        nextRemainingDrafts = await pendingReceiptReviews.persistDrafts(remainingDrafts);
      } catch {
        // The saved expense is complete; keep the remaining in-memory queue usable.
      }
    }
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    setReceiptDrafts(nextRemainingDrafts);

    if (nextRemainingDrafts.length > 0) {
      setView("confirm");
      return;
    }

    setReceiptBatchTotal(0);
    setView("expenses");
  }

  async function handleAutoSaveReceipt(draft: ReceiptDraft): Promise<Expense> {
    const expense = await budgetData.addReceiptExpense(draft.initialValues, {
      imageBlob: draft.imageFile,
      ocrText: draft.ocrText,
    });
    receiptQualityMetrics.recordAutoSave(draft.confidenceAssessment);
    return expense;
  }

  function handleAutoSaveComplete(expense: Expense, draft: ReceiptDraft) {
    setRecentAutoSave({
      expense,
      expiresAt: Date.now() + AUTO_SAVE_UNDO_WINDOW_MS,
      qualityPolicyVersion: normalizeReceiptQualityPolicyVersion(draft.confidenceAssessment?.policyVersion),
      qualityScopeKey: receiptQualityMetrics.scopeKey,
    });
    setUndoError(null);
    setView("dashboard");
  }

  async function handleUndoAutoSave() {
    if (!recentAutoSave || isUndoingAutoSave) {
      return;
    }

    setIsUndoingAutoSave(true);
    setUndoError(null);
    try {
      await budgetData.removeExpense(recentAutoSave.expense);
      receiptQualityMetrics.recordUndo(
        recentAutoSave.qualityScopeKey,
        recentAutoSave.qualityPolicyVersion,
      );
      setRecentAutoSave(null);
    } catch {
      setUndoError("登録を元に戻せませんでした。支出一覧を確認してください。");
    } finally {
      setIsUndoingAutoSave(false);
    }
  }

  function handleDashboardReceiptCapture(files: File[]) {
    setInitialReceiptFiles(files);
    setView("receipt");
  }

  async function handleReceiveDrafts(drafts: ReceiptDraft[], cause: ReceiptReviewCause) {
    if (drafts.length === 0) {
      return;
    }

    let nextDrafts = drafts;
    try {
      nextDrafts = await pendingReceiptReviews.persistDrafts(drafts);
    } catch {
      // Keep the current review usable even when this device cannot persist it.
    }
    receiptQualityMetrics.recordNeedsReview(
      drafts.map((draft) => draft.confidenceAssessment),
      cause,
    );
    revokeReceiptDraftUrls(receiptDrafts);
    setReceiptDrafts(nextDrafts);
    setReceiptBatchTotal(nextDrafts.length);
    setView("confirm");
  }

  function handleOpenPendingReviews() {
    const drafts = pendingReceiptReviews.restoreDrafts();
    if (drafts.length === 0) {
      return;
    }

    revokeReceiptDraftUrls(receiptDrafts);
    setReceiptDrafts(drafts);
    setReceiptBatchTotal(drafts.length);
    setView("confirm");
  }

  function handleNavigate(nextView: View) {
    if (view === "confirm" && nextView !== "confirm") {
      revokeReceiptDraftUrls(receiptDrafts);
      setReceiptDrafts([]);
      setReceiptBatchTotal(0);
    }

    if (nextView !== "receipt") {
      setInitialReceiptFiles(null);
    }

    setView(nextView);
  }

  function handleCancelReceiptConfirm() {
    revokeReceiptDraftUrls(receiptDrafts);
    setReceiptDrafts([]);
    setReceiptBatchTotal(0);
    setView("dashboard");
  }

  function handleSkipReceiptDraft() {
    if (!receiptDraft) {
      return;
    }

    const remainingDrafts = receiptDrafts.slice(1);
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    setReceiptDrafts(remainingDrafts);

    if (remainingDrafts.length === 0) {
      setReceiptBatchTotal(0);
      setView("dashboard");
    }
  }

  async function handleDiscardReceiptDraft() {
    if (!receiptDraft || !window.confirm("この要確認レシートを削除しますか？")) {
      return;
    }

    if (receiptDraft.pendingReviewId) {
      await pendingReceiptReviews.removeReviews([receiptDraft.pendingReviewId]);
    }
    receiptQualityMetrics.recordReviewDiscarded(receiptDraft.confidenceAssessment);
    const remainingDrafts = receiptDrafts.slice(1);
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    setReceiptDrafts(remainingDrafts);

    if (remainingDrafts.length === 0) {
      setReceiptBatchTotal(0);
      setView("dashboard");
    }
  }

  async function handleUpdateCurrentReceiptDraft(nextDraft: ReceiptDraft) {
    let persistedDraft = nextDraft;
    if (nextDraft.pendingReviewId) {
      [persistedDraft] = await pendingReceiptReviews.persistDrafts([nextDraft]);
    }
    setReceiptDrafts((currentDrafts) => {
      if (currentDrafts.length === 0) {
        return currentDrafts;
      }

      return [persistedDraft, ...currentDrafts.slice(1)];
    });
  }

  if (cloudAccessState !== "ready") {
    return (
      <CloudAccessScreen
        state={cloudAccessState}
        firebaseAuth={firebaseAuth}
        cloudHousehold={cloudHousehold}
      />
    );
  }

  if (!cloudBudgetRepository) {
    return (
      <CloudAccessScreen
        state="configurationMissing"
        firebaseAuth={firebaseAuth}
        cloudHousehold={cloudHousehold}
      />
    );
  }

  if (budgetData.isLoading) {
    return (
      <main className="app-shell center-shell">
        <div className="loading-panel">
          <ReceiptText size={32} aria-hidden="true" />
          <span>読み込み中</span>
        </div>
      </main>
    );
  }

  if (budgetData.error) {
    return (
      <main className="app-shell center-shell">
        <div className="loading-panel error-panel">
          <span>{budgetData.error}</span>
          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={16} aria-hidden="true" />
              再読み込み
            </button>
            {firebaseAuth.user && (
              <button className="button button-primary" type="button" onClick={() => void firebaseAuth.signOut()}>
                ログアウト
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!cloudConnection || cloudConnection.status !== "online") {
    return (
      <CloudConnectionRequiredScreen
        connection={cloudConnection ?? { status: "reconnecting" }}
        onRetry={budgetData.retryCloudConnection}
        onSignOut={firebaseAuth.signOut}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header cloud-mode">
        <div className="brand-mark">
          <Cloud size={20} aria-hidden="true" />
        </div>
        <div className="brand-copy">
          <span className="app-name">家族の家計簿</span>
          <span className="app-subtitle">{activeHouseholdName ?? "共有家計簿"} / 同期済み</span>
        </div>
        <span className="storage-mode-badge" aria-label="現在の保存先: クラウド">
          クラウド
        </span>
      </header>

      {isUpdateAvailable && (
        <div className="update-banner" role="status">
          <span>新しいバージョンを利用できます</span>
          <button className="button button-secondary button-compact" type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" />
            更新
          </button>
        </div>
      )}

      {recentAutoSave && (
        <ReceiptAutoSaveNotice
          expense={recentAutoSave.expense}
          error={undoError}
          isUndoing={isUndoingAutoSave}
          onUndo={() => void handleUndoAutoSave()}
        />
      )}

      <main className="app-main">
        <Suspense fallback={<ScreenFallback />}>
          {view === "dashboard" && (
            <DashboardScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              canCaptureReceipt={canUseReceiptOcr}
              pendingReviewCount={pendingReceiptReviews.count}
              pendingReviewError={pendingReceiptReviews.error}
              onCaptureReceipt={handleDashboardReceiptCapture}
              onCaptureUnavailable={() => setView("settings")}
              onReviewPending={handleOpenPendingReviews}
            />
          )}

          {view === "expenses" && (
            <ExpenseListScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              categoryMap={budgetData.categoryMap}
              memberNameMap={householdMemberNameMap}
              onAddExpense={budgetData.addManualExpense}
              onUpdateExpense={budgetData.updateExpense}
              onDeleteExpense={budgetData.removeExpense}
            />
          )}

          {view === "receipt" && (
            <ReceiptCaptureScreen
              onConfirm={handleReceiveDrafts}
              onAutoSave={handleAutoSaveReceipt}
              onAutoSaveComplete={handleAutoSaveComplete}
              suggestCategoryForShop={budgetData.suggestCategoryForShop}
              isGoogleVisionAuthenticated={Boolean(firebaseAuth.user && cloudHousehold.household)}
              getGoogleVisionIdToken={firebaseAuth.getIdToken}
              initialFiles={initialReceiptFiles ?? undefined}
              onInitialFilesConsumed={() => setInitialReceiptFiles(null)}
            />
          )}

          {view === "yearly" && (
            <YearlyExpenseScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              categoryMap={budgetData.categoryMap}
            />
          )}

          {view === "confirm" && receiptDraft && (
            <OcrConfirmScreen
              draft={receiptDraft}
              categories={budgetData.categories}
              queuePosition={receiptQueuePosition ?? undefined}
              onUpdateDraft={handleUpdateCurrentReceiptDraft}
              suggestCategoryForShop={budgetData.suggestCategoryForShop}
              getGoogleVisionIdToken={firebaseAuth.getIdToken}
              onBack={handleCancelReceiptConfirm}
              onSkip={receiptDrafts.length > 1 ? handleSkipReceiptDraft : undefined}
              onDiscard={handleDiscardReceiptDraft}
              onSave={handleSaveReceiptExpense}
            />
          )}

          {view === "settings" && (
            <SettingsScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              settings={budgetData.settings}
              onImportBackup={budgetData.importBackup}
              onResetData={async () => {
                await budgetData.resetData();
                await pendingReceiptReviews.clearReviews();
                receiptQualityMetrics.clearMetrics();
              }}
              onRefreshData={budgetData.refresh}
              onAddCategory={budgetData.addCategory}
              onUpdateCategory={budgetData.updateCategory}
              onDeleteCategory={budgetData.removeCategory}
              onUpsertShopCategoryRule={budgetData.upsertShopCategoryRule}
              onSaveShopCategoryRule={budgetData.saveShopCategoryRule}
              onDeleteShopCategoryRule={budgetData.removeShopCategoryRule}
              hasLocalShopCategoryRulesToMigrate={budgetData.hasLocalShopCategoryRulesToMigrate}
              firebaseAuth={firebaseAuth}
              cloudHousehold={cloudHousehold}
              googleSheetsSync={googleSheetsSync}
              cloudConnection={budgetData.cloudConnection}
              receiptQualityMetrics={receiptQualityMetrics}
            />
          )}
        </Suspense>
      </main>

      {isManualQuickAddOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="支出の追加">
            <div className="modal-title-row">
              <h2>手入力</h2>
            </div>
            <ExpenseEditor
              categories={budgetData.categories}
              submitLabel="保存"
              onCancel={() => setIsManualQuickAddOpen(false)}
              onSubmit={async (values) => {
                await budgetData.addManualExpense(values);
                setIsManualQuickAddOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <button className="floating-action" type="button" onClick={() => setIsManualQuickAddOpen(true)} aria-label="支出を手入力">
        <Plus size={24} aria-hidden="true" />
      </button>

      <nav className="bottom-nav" aria-label="主要画面">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.view || (view === "confirm" && item.view === "receipt");
          return (
            <button
              key={item.view}
              className={isActive ? "active" : ""}
              type="button"
              onClick={() => handleNavigate(item.view)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ScreenFallback() {
  return (
    <div className="loading-panel screen-loading">
      <ReceiptText size={28} aria-hidden="true" />
      <span>読み込み中</span>
    </div>
  );
}
