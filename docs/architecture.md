# Architecture

## 方針

MVPはブラウザだけで完結します。支出、カテゴリ、任意のレシート画像はIndexedDBに保存し、設定はlocalStorageに保存します。外部DB、ログイン、サーバーAPIは使いません。

## レイヤー

```text
React screens/components
  -> useBudgetData hook
    -> IndexedDB repository
  -> OCR runner
  -> receipt parser
  -> CSV exporter
```

## データモデル

```ts
type Expense = {
  id: string;
  date: string;
  shopName: string;
  amount: number;
  categoryId: string;
  memo: string;
  source: "manual" | "receipt";
  receiptImageId?: string;
  createdAt: string;
  updatedAt: string;
};
```

`Category` と `ReceiptImage` も要件通りに保持します。レシート画像保存OFFの場合、OCR後に支出だけを保存し、`ReceiptImage` は作成しません。

## IndexedDB

- DB name: `local-kakeibo-pwa`
- version: `1`
- stores:
  - `expenses`
  - `categories`
  - `receiptImages`

カテゴリが空の場合は初期カテゴリをseedします。

## OCR

OCRはTesseract.jsでブラウザ内実行します。候補抽出では「合計」「税込」「現計」「お買上計」などの周辺にある金額を優先し、保存前に確認画面でユーザー修正を必須にします。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュします。
