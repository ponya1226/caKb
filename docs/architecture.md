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

OCR範囲は、複数プリセットを順番に試し、日付、店舗名、金額候補が最も揃う結果を自動採用できます。ユーザーが手動調整した範囲や自動採用された範囲はlocalStorageへ任意保存し、次回の初期範囲として利用します。

レシートのカテゴリ初期値は、保存済み支出の店舗名とOCR候補の店舗名を正規化して照合し、同じ店舗名の直近カテゴリを使います。専用の学習テーブルはMVPでは作らず、保存済み支出を学習元にします。

複数レシート登録は、選択された画像をブラウザ内で順番にOCRし、確認画面で1枚ずつ修正・保存します。途中で未保存の確認キューを破棄しても、保存済み支出は残ります。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュします。
