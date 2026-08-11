import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CloudAccessScreen } from "../../../../src/components/CloudAccessScreen";
import { OcrConfirmScreen } from "../../../../src/components/OcrConfirmScreen";
import { DashboardScreen } from "../../../../src/components/DashboardScreen";
import { ExpenseListScreen } from "../../../../src/components/ExpenseListScreen";
import { ReceiptAutoSaveNotice } from "../../../../src/components/ReceiptAutoSaveNotice";
import { ReceiptCaptureScreen } from "../../../../src/components/ReceiptCaptureScreen";
import { ReceiptQualityMetricsPanel } from "../../../../src/components/ReceiptQualityMetricsPanel";
import { usePendingReceiptReviews } from "../../../../src/hooks/usePendingReceiptReviews";
import { useBudgetData } from "../../../../src/hooks/useBudgetData";
import { useReceiptQualityMetrics } from "../../../../src/hooks/useReceiptQualityMetrics";
import type { CloudHouseholdState } from "../../../../src/hooks/useCloudHousehold";
import type { FirebaseAuthState } from "../../../../src/hooks/useFirebaseAuth";
import { RECEIPT_CONFIDENCE_POLICY_VERSION } from "../../../../src/lib/receiptConfidence";
import "../../../../src/styles.css";
import type { Expense, ExpenseFormValues, ReceiptConfidenceAssessment, ReceiptDraft, ReceiptSaveOptions } from "../../../../src/types";

const categories = [
  { id: "food", name: "食費", color: "#16a34a", sortOrder: 1 },
  { id: "other", name: "その他", color: "#64748b", sortOrder: 2 },
];

const initialDraft: ReceiptDraft = {
  imageFile: new File(["anonymous receipt fixture"], "anonymous-receipt.png", { type: "image/png" }),
  imagePreviewUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1cF8QAAAABJRU5ErkJggg==",
  ocrText: [
    "SAMPLE STORE",
    "2026年08月09日",
    "サンプル商品A 300",
    "サンプル商品B 200",
    "合計 500",
  ].join("\n"),
  parseResult: {
    dateCandidates: [],
    shopNameCandidates: [],
    amountCandidates: [],
    lineItemCandidates: [],
    riskSignals: { balanceAmounts: [] },
  },
  initialValues: {
    date: "2026-08-09",
    shopName: "サンプルストア",
    amount: 500,
    categoryId: "food",
    memo: "",
    lineItems: [
      { id: "fixture-item-a", name: "サンプル商品A", amount: 300, source: "ocr", confidence: 0.99 },
      { id: "fixture-item-b", name: "サンプル商品B", amount: 200, source: "ocr", confidence: 0.98 },
    ],
  },
  categorySuggestion: {
    categoryId: "food",
    matchedShopName: "サンプルストア",
    source: "rule",
    ruleId: "fixture-rule",
  },
};

const autoSaveAssessment: ReceiptConfidenceAssessment = {
  policyVersion: RECEIPT_CONFIDENCE_POLICY_VERSION,
  decision: "autoSave",
  signals: {
    ocrSucceeded: true,
    totalResolved: true,
    dateResolved: true,
    merchantResolved: true,
    categoryResolved: true,
    conflictingAmounts: false,
    conflictingMerchants: false,
    suspiciousBalanceCandidate: false,
    lineItemConsistency: "consistent",
  },
  reasons: [],
};

const needsReviewAssessment: ReceiptConfidenceAssessment = {
  ...autoSaveAssessment,
  decision: "needsReview",
  signals: {
    ...autoSaveAssessment.signals,
    totalResolved: false,
    categoryResolved: false,
    conflictingAmounts: true,
  },
  reasons: [
    { code: "total_conflict", message: "支払総額の候補が複数あります", severity: "blocking" },
    { code: "category_unresolved", message: "カテゴリを選んでください", severity: "blocking" },
  ],
};

function OcrConfirmHarness() {
  const [draft, setDraft] = useState(initialDraft);
  const [saveResult, setSaveResult] = useState<{
    values: ExpenseFormValues;
    options?: ReceiptSaveOptions;
  } | null>(null);

  return (
    <div className="app-shell">
      <main className="app-main">
        <OcrConfirmScreen
          draft={draft}
          categories={categories}
          onBack={() => undefined}
          onUpdateDraft={setDraft}
          suggestCategoryForShop={() => null}
          getGoogleVisionIdToken={async () => null}
          onSave={async (values, options) => setSaveResult({ values, options })}
        />
        {saveResult && <output data-testid="save-result">{JSON.stringify(saveResult)}</output>}
      </main>
    </div>
  );
}

function createFixtureExpense(draft: ReceiptDraft): Expense {
  return {
    id: "fixture-auto-expense",
    ...draft.initialValues,
    source: "receipt",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

function ReceiptCaptureHarness({ needsReview }: { needsReview: boolean }) {
  const [reviewDraft, setReviewDraft] = useState<ReceiptDraft | null>(null);
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);
  const [wasUndone, setWasUndone] = useState(false);

  if (reviewDraft) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <OcrConfirmScreen
            draft={reviewDraft}
            categories={categories}
            onBack={() => setReviewDraft(null)}
            onUpdateDraft={setReviewDraft}
            suggestCategoryForShop={() => null}
            getGoogleVisionIdToken={async () => "fixture-token"}
            onSave={async () => undefined}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {savedExpense && (
        <ReceiptAutoSaveNotice
          expense={savedExpense}
          isUndoing={false}
          onUndo={() => {
            setSavedExpense(null);
            setWasUndone(true);
          }}
        />
      )}
      <main className="app-main">
        <ReceiptCaptureScreen
          onConfirm={async (drafts) => setReviewDraft(drafts[0] ?? null)}
          onAutoSave={async (draft) => createFixtureExpense(draft)}
          onAutoSaveComplete={(expense) => setSavedExpense(expense)}
          suggestCategoryForShop={() => needsReview ? null : {
            categoryId: "food",
            matchedShopName: "サンプルストア",
            source: "rule",
            ruleId: "fixture-rule",
          }}
          isGoogleVisionAuthenticated
          getGoogleVisionIdToken={async () => "fixture-token"}
          isOcrAvailable
          ocrRunner={async (_image, options) => {
            options?.onProgress?.({ status: "読み取り完了", progress: 1 });
            return {
              provider: "googleVision",
              text: [
                "サンプルストア",
                "2026年08月09日",
                "サンプル商品 ¥500",
                "合計 ¥500",
              ].join("\n"),
            };
          }}
        />
        {wasUndone && <output data-testid="undo-result">取り消しました</output>}
      </main>
    </div>
  );
}

function PendingReviewHarness() {
  const scopeKey = new URLSearchParams(window.location.search).get("scope") ?? "household:e2e";
  const pendingReviews = usePendingReceiptReviews(scopeKey);
  const [reviewDraft, setReviewDraft] = useState<ReceiptDraft | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function openReviews() {
    setReviewDraft(pendingReviews.restoreDrafts()[0] ?? null);
  }

  async function removeCurrentReview(message: string) {
    if (!reviewDraft?.pendingReviewId) {
      return;
    }
    await pendingReviews.removeReviews([reviewDraft.pendingReviewId]);
    URL.revokeObjectURL(reviewDraft.imagePreviewUrl);
    setReviewDraft(null);
    setResult(message);
  }

  if (reviewDraft) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <OcrConfirmScreen
            draft={reviewDraft}
            categories={categories}
            onBack={() => {
              URL.revokeObjectURL(reviewDraft.imagePreviewUrl);
              setReviewDraft(null);
            }}
            onDiscard={async () => {
              if (window.confirm("この要確認レシートを削除しますか？")) {
                await removeCurrentReview("確認を破棄しました");
              }
            }}
            onUpdateDraft={async (draft) => {
              const [savedDraft] = await pendingReviews.persistDrafts([draft]);
              setReviewDraft(savedDraft);
            }}
            suggestCategoryForShop={() => null}
            getGoogleVisionIdToken={async () => "fixture-token"}
            onSave={async () => removeCurrentReview("確認を保存しました")}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <DashboardScreen
          expenses={[]}
          categories={categories}
          canCaptureReceipt
          pendingReviewCount={pendingReviews.count}
          pendingReviewError={pendingReviews.error}
          onCaptureReceipt={() => undefined}
          onCaptureUnavailable={() => undefined}
          onReviewPending={() => void openReviews()}
        />
        <button
          data-testid="create-pending-review"
          type="button"
          disabled={pendingReviews.isLoading}
          onClick={() => void pendingReviews.persistDrafts([{ ...initialDraft, pendingReviewId: undefined }])}
        >
          要確認fixtureを追加
        </button>
        {result && <output data-testid="pending-result">{result}</output>}
      </main>
    </div>
  );
}

function ReceiptQualityMetricsHarness() {
  const searchParams = new URLSearchParams(window.location.search);
  const scopeKey = searchParams.get("scope") ?? "household:e2e";
  const readOnly = searchParams.get("readonly") === "1";
  const metrics = useReceiptQualityMetrics(scopeKey);

  return (
    <div className="app-shell">
      <main className="app-main">
        <ReceiptQualityMetricsPanel
          selectedMonthKey={metrics.selectedMonthKey}
          monthKeys={metrics.monthKeys}
          summary={metrics.summary}
          reportText={metrics.reportText}
          error={metrics.error}
          onMonthChange={metrics.selectMonth}
          onClear={readOnly ? undefined : metrics.clearMetrics}
        />
        {!readOnly && <div className="capture-actions">
          <button
            data-testid="record-auto-save"
            type="button"
            onClick={() => metrics.recordAutoSave(autoSaveAssessment)}
          >
            自動登録を記録
          </button>
          <button
            data-testid="record-review"
            type="button"
            onClick={() => metrics.recordNeedsReview([needsReviewAssessment], "confidence")}
          >
            要確認を記録
          </button>
          <button
            data-testid="record-batch-review"
            type="button"
            onClick={() => metrics.recordNeedsReview([autoSaveAssessment], "batch")}
          >
            一括確認を記録
          </button>
          <button data-testid="record-undo" type="button" onClick={() => metrics.recordUndo()}>
            元に戻すを記録
          </button>
          <button
            data-testid="record-correction"
            type="button"
            onClick={() => metrics.recordReviewSaved(needsReviewAssessment, true)}
          >
            総額修正を記録
          </button>
        </div>}
      </main>
    </div>
  );
}

function BudgetCrudHarness() {
  const budgetData = useBudgetData();

  if (budgetData.isLoading) {
    return <div className="loading-panel">読み込み中</div>;
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <ExpenseListScreen
          expenses={budgetData.expenses}
          categories={budgetData.categories}
          categoryMap={budgetData.categoryMap}
          memberNameMap={new Map()}
          onAddExpense={budgetData.addManualExpense}
          onUpdateExpense={budgetData.updateExpense}
          onDeleteExpense={budgetData.removeExpense}
        />
      </main>
    </div>
  );
}

function CloudAccessHarness({ creationAuthorized }: { creationAuthorized: boolean }) {
  const [result, setResult] = useState<string | null>(null);
  const firebaseAuth: FirebaseAuthState = {
    isConfigured: true,
    isLoading: false,
    isWorking: false,
    user: {
      uid: "fixture-user",
      displayName: "テスト利用者",
      email: "fixture@example.invalid",
    },
    error: null,
    getIdToken: async () => "fixture-token",
    signInWithGoogle: async () => undefined,
    signOut: async () => setResult("ログアウト"),
    clearError: () => undefined,
  };
  const cloudHousehold: CloudHouseholdState = {
    isLoading: false,
    isWorking: false,
    household: null,
    lastMigration: null,
    members: [],
    invite: null,
    isHouseholdCreationAuthorized: creationAuthorized,
    error: null,
    refresh: async () => undefined,
    createHousehold: async (name) => setResult(`作成:${name}`),
    migrateLocalData: async () => undefined,
    createInvite: async () => undefined,
    joinHousehold: async (code) => setResult(`参加:${code}`),
    removeMember: async () => undefined,
    clearError: () => undefined,
  };

  return (
    <>
      <CloudAccessScreen
        state="householdRequired"
        firebaseAuth={firebaseAuth}
        cloudHousehold={cloudHousehold}
      />
      {result && <output data-testid="cloud-access-result">{result}</output>}
    </>
  );
}

const screen = new URLSearchParams(window.location.search).get("screen");
createRoot(document.getElementById("root")!).render(
  screen === "capture-high"
    ? <ReceiptCaptureHarness needsReview={false} />
    : screen === "capture-low"
      ? <ReceiptCaptureHarness needsReview />
      : screen === "pending-inbox"
        ? <PendingReviewHarness />
        : screen === "quality-metrics"
          ? <ReceiptQualityMetricsHarness />
          : screen === "budget-crud"
            ? <BudgetCrudHarness />
            : screen === "family-access"
              ? <CloudAccessHarness creationAuthorized={false} />
              : screen === "family-bootstrap"
                ? <CloudAccessHarness creationAuthorized />
          : <OcrConfirmHarness />,
);
