import { useState } from "react";
import { createRoot } from "react-dom/client";
import { OcrConfirmScreen } from "../../../../src/components/OcrConfirmScreen";
import "../../../../src/styles.css";
import type { ExpenseFormValues, ReceiptDraft, ReceiptSaveOptions } from "../../../../src/types";

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

createRoot(document.getElementById("root")!).render(<OcrConfirmHarness />);
