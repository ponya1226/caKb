import { lazy, Suspense, useState } from "react";
import { CalendarDays, Camera, Home, List, Plus, ReceiptText, Settings } from "lucide-react";
import { ExpenseEditor } from "./components/ExpenseEditor";
import { useBudgetData } from "./hooks/useBudgetData";
import { useFirebaseAuth } from "./hooks/useFirebaseAuth";
import { normalizeShopNameForCategory } from "./lib/categorySuggestion";
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
  const budgetData = useBudgetData();
  const firebaseAuth = useFirebaseAuth();
  const receiptDraft = receiptDrafts[0] ?? null;
  const receiptQueuePosition = receiptDraft
    ? {
        current: Math.max(1, receiptBatchTotal - receiptDrafts.length + 1),
        total: receiptBatchTotal || receiptDrafts.length,
      }
    : null;

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
      budgetData.upsertShopCategoryRule(values.shopName, values.categoryId);
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
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <ReceiptText size={20} aria-hidden="true" />
        </div>
        <div>
          <span className="app-name">ローカル家計簿</span>
          <span className="app-subtitle">{firebaseAuth.user ? "ログイン中 / IndexedDB保存" : "IndexedDB保存"}</span>
        </div>
      </header>

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
              onAddCategory={budgetData.addCategory}
              onUpdateCategory={budgetData.updateCategory}
              onDeleteCategory={budgetData.removeCategory}
              firebaseAuth={firebaseAuth}
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
