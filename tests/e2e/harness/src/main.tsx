import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OcrConfirmScreen } from "../../../../src/components/OcrConfirmScreen";
import { DashboardScreen } from "../../../../src/components/DashboardScreen";
import { ReceiptAutoSaveNotice } from "../../../../src/components/ReceiptAutoSaveNotice";
import { ReceiptCaptureScreen } from "../../../../src/components/ReceiptCaptureScreen";
import { usePendingReceiptReviews } from "../../../../src/hooks/usePendingReceiptReviews";
import "../../../../src/styles.css";
import type { Expense, ExpenseFormValues, ReceiptDraft, ReceiptSaveOptions } from "../../../../src/types";

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
          onAutoSaveComplete={setSavedExpense}
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

const screen = new URLSearchParams(window.location.search).get("screen");
createRoot(document.getElementById("root")!).render(
  screen === "capture-high"
    ? <ReceiptCaptureHarness needsReview={false} />
    : screen === "capture-low"
      ? <ReceiptCaptureHarness needsReview />
      : screen === "pending-inbox"
        ? <PendingReviewHarness />
      : <OcrConfirmHarness />,
);
