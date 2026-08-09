import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OcrConfirmScreen } from "../../../../src/components/OcrConfirmScreen";
import { ReceiptAutoSaveNotice } from "../../../../src/components/ReceiptAutoSaveNotice";
import { ReceiptCaptureScreen } from "../../../../src/components/ReceiptCaptureScreen";
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
          onConfirm={(drafts) => setReviewDraft(drafts[0] ?? null)}
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

const screen = new URLSearchParams(window.location.search).get("screen");
createRoot(document.getElementById("root")!).render(
  screen === "capture-high"
    ? <ReceiptCaptureHarness needsReview={false} />
    : screen === "capture-low"
      ? <ReceiptCaptureHarness needsReview />
      : <OcrConfirmHarness />,
);
