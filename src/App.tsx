import { lazy, Suspense, useState } from "react";
import { Camera, Home, List, Plus, ReceiptText, Settings } from "lucide-react";
import { ExpenseEditor } from "./components/ExpenseEditor";
import { useBudgetData } from "./hooks/useBudgetData";
import type { ExpenseFormValues, ReceiptDraft } from "./types";

type View = "dashboard" | "expenses" | "receipt" | "confirm" | "settings";

const DashboardScreen = lazy(() =>
  import("./components/DashboardScreen").then((module) => ({ default: module.DashboardScreen })),
);
const ExpenseListScreen = lazy(() =>
  import("./components/ExpenseListScreen").then((module) => ({ default: module.ExpenseListScreen })),
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
  { view: "receipt", label: "レシート", icon: Camera },
  { view: "settings", label: "設定", icon: Settings },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [isManualQuickAddOpen, setIsManualQuickAddOpen] = useState(false);
  const budgetData = useBudgetData();

  async function handleSaveReceiptExpense(values: ExpenseFormValues) {
    if (!receiptDraft) {
      return;
    }

    await budgetData.addReceiptExpense(values, {
      imageBlob: receiptDraft.imageFile,
      ocrText: receiptDraft.ocrText,
    });
    URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    setReceiptDraft(null);
    setView("expenses");
  }

  function handleReceiveDraft(draft: ReceiptDraft) {
    if (receiptDraft?.imagePreviewUrl) {
      URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    }

    setReceiptDraft(draft);
    setView("confirm");
  }

  function handleNavigate(nextView: View) {
    if (view === "confirm" && receiptDraft?.imagePreviewUrl && nextView !== "confirm") {
      URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
      setReceiptDraft(null);
    }

    setView(nextView);
  }

  function handleCancelReceiptConfirm() {
    if (receiptDraft?.imagePreviewUrl) {
      URL.revokeObjectURL(receiptDraft.imagePreviewUrl);
    }

    setReceiptDraft(null);
    setView("receipt");
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
          <span className="app-subtitle">IndexedDB保存</span>
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

          {view === "receipt" && <ReceiptCaptureScreen onConfirm={handleReceiveDraft} />}

          {view === "confirm" && receiptDraft && (
            <OcrConfirmScreen
              draft={receiptDraft}
              categories={budgetData.categories}
              settings={budgetData.settings}
              onBack={handleCancelReceiptConfirm}
              onSave={handleSaveReceiptExpense}
            />
          )}

          {view === "settings" && (
            <SettingsScreen
              expenses={budgetData.expenses}
              categories={budgetData.categories}
              settings={budgetData.settings}
              onUpdateSettings={budgetData.updateSettings}
              onResetData={budgetData.resetData}
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
