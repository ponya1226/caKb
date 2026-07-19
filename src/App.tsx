import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CalendarDays, Camera, Cloud, Home, List, Plus, ReceiptText, RefreshCw, Settings } from "lucide-react";
import { ExpenseEditor } from "./components/ExpenseEditor";
import { useBudgetData } from "./hooks/useBudgetData";
import { useCloudHousehold } from "./hooks/useCloudHousehold";
import { useFirebaseAuth } from "./hooks/useFirebaseAuth";
import { normalizeShopNameForCategory } from "./lib/categorySuggestion";
import { getFirebaseClientServices } from "./lib/firebaseConfig";
import { createFirestoreBudgetRepository } from "./lib/repositories/firestoreBudgetRepository";
import type { ExpenseFormValues, ReceiptDraft, ReceiptSaveOptions } from "./types";

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
  { view: "settings", label: "設定", icon: Settings },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [receiptDrafts, setReceiptDrafts] = useState<ReceiptDraft[]>([]);
  const [receiptBatchTotal, setReceiptBatchTotal] = useState(0);
  const [isManualQuickAddOpen, setIsManualQuickAddOpen] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const firebaseAuth = useFirebaseAuth();
  const cloudHousehold = useCloudHousehold(firebaseAuth.user);
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
  const budgetData = useBudgetData({
    repository: cloudBudgetRepository ?? undefined,
    storageMode: cloudBudgetRepository ? "cloud" : "local",
  });
  const isCloudStorage = budgetData.storageMode === "cloud";
  const activeHouseholdName = cloudHousehold.household?.household.name;
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

  function revokeReceiptDraftUrls(drafts: ReceiptDraft[]) {
    drafts.forEach((draft) => {
      URL.revokeObjectURL(draft.imagePreviewUrl);
      if (draft.ocrImagePreviewUrl) {
        URL.revokeObjectURL(draft.ocrImagePreviewUrl);
      }
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
    await budgetData.addReceiptExpense(values, {
      imageBlob: receiptDraft.imageFile,
      ocrText: receiptDraft.ocrText,
    });
    if (options?.saveCategoryRule) {
      await budgetData.upsertShopCategoryRule(values.shopName, values.categoryId);
    }
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    if (receiptDraft.ocrImagePreviewUrl) {
      URL.revokeObjectURL(receiptDraft.ocrImagePreviewUrl);
    }
    setReceiptDrafts(remainingDrafts);

    if (remainingDrafts.length > 0) {
      setView("confirm");
      return;
    }

    setReceiptBatchTotal(0);
    setView("expenses");
  }

  function handleReceiveDrafts(drafts: ReceiptDraft[]) {
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

    setView(nextView);
  }

  function handleCancelReceiptConfirm() {
    revokeReceiptDraftUrls(receiptDrafts);
    setReceiptDrafts([]);
    setReceiptBatchTotal(0);
    setView("receipt");
  }

  function handleSkipReceiptDraft() {
    if (!receiptDraft) {
      return;
    }

    const remainingDrafts = receiptDrafts.slice(1);
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    if (receiptDraft.ocrImagePreviewUrl) {
      URL.revokeObjectURL(receiptDraft.ocrImagePreviewUrl);
    }
    setReceiptDrafts(remainingDrafts);

    if (remainingDrafts.length === 0) {
      setReceiptBatchTotal(0);
      setView("receipt");
    }
  }

  function handleUpdateCurrentReceiptDraft(nextDraft: ReceiptDraft) {
    setReceiptDrafts((currentDrafts) => {
      if (currentDrafts.length === 0) {
        return currentDrafts;
      }

      return [nextDraft, ...currentDrafts.slice(1)];
    });
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

  return (
    <div className="app-shell">
      <header className={`app-header ${isCloudStorage ? "cloud-mode" : "local-mode"}`}>
        <div className="brand-mark">
          {isCloudStorage ? <Cloud size={20} aria-hidden="true" /> : <ReceiptText size={20} aria-hidden="true" />}
        </div>
        <div className="brand-copy">
          <span className="app-name">{isCloudStorage ? "クラウド家計簿" : "ローカル家計簿"}</span>
          <span className="app-subtitle">
            {isCloudStorage
              ? `${activeHouseholdName ?? "共有家計簿"} / Firestore保存`
              : firebaseAuth.user
                ? "Googleログイン中 / この端末に保存"
                : "未ログイン / この端末に保存"}
          </span>
        </div>
        <span className="storage-mode-badge" aria-label={`現在の保存先: ${isCloudStorage ? "クラウド" : "ローカル"}`}>
          {isCloudStorage ? "クラウド" : "ローカル"}
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

      <main className="app-main">
        <Suspense fallback={<ScreenFallback />}>
          {view === "dashboard" && (
            <DashboardScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              onAddExpense={() => setIsManualQuickAddOpen(true)}
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
              suggestCategoryForShop={budgetData.suggestCategoryForShop}
              savedOcrCrop={budgetData.settings.lastOcrCrop}
              onSaveOcrCrop={(crop) => budgetData.updateSettings({ ...budgetData.settings, lastOcrCrop: crop })}
              isGoogleVisionAuthenticated={Boolean(firebaseAuth.user)}
              getGoogleVisionIdToken={firebaseAuth.getIdToken}
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
              settings={budgetData.settings}
              queuePosition={receiptQueuePosition ?? undefined}
              savedOcrCrop={budgetData.settings.lastOcrCrop}
              onSaveOcrCrop={(crop) => budgetData.updateSettings({ ...budgetData.settings, lastOcrCrop: crop })}
              onUpdateDraft={handleUpdateCurrentReceiptDraft}
              suggestCategoryForShop={budgetData.suggestCategoryForShop}
              getGoogleVisionIdToken={firebaseAuth.getIdToken}
              onBack={handleCancelReceiptConfirm}
              onSkip={receiptDrafts.length > 1 ? handleSkipReceiptDraft : undefined}
              onSave={handleSaveReceiptExpense}
            />
          )}

          {view === "settings" && (
            <SettingsScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              settings={budgetData.settings}
              storageHealth={budgetData.storageHealth}
              onUpdateSettings={budgetData.updateSettings}
              onImportBackup={budgetData.importBackup}
              onRequestPersistentStorage={budgetData.requestPersistentStorage}
              onRefreshStorageHealth={budgetData.refreshStorageHealth}
              onResetData={budgetData.resetData}
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
              storageMode={budgetData.storageMode}
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
