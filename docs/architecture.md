# Architecture

## 方針

MVPはブラウザだけで完結します。支出、カテゴリ、任意のレシート画像はIndexedDBに保存し、設定はlocalStorageに保存します。外部DB、ログイン、サーバーAPIは使いません。

次フェーズでは家族共有、認証、スプレッドシート同期に対応するため、Firebase AuthとCloud Firestoreを第一候補にクラウド正本化を進めます。詳細は `docs/decisions/0005-family-cloud-ledger-direction.md` に従います。

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

`Category` と `ReceiptImage` も要件通りに保持します。カテゴリは設定画面で追加、名称変更、色変更、未使用カテゴリの削除ができます。レシート画像保存OFFの場合、OCR後に支出だけを保存し、`ReceiptImage` は作成しません。

## IndexedDB

- DB name: `local-kakeibo-pwa`
- version: `1`
- stores:
  - `expenses`
  - `categories`
  - `receiptImages`

カテゴリが空の場合は初期カテゴリをseedします。

## 保存状態とバックアップ

支出、カテゴリ、任意のレシート画像は引き続きブラウザ内のIndexedDBに保存します。設定はlocalStorageに保存します。

アプリは起動時と設定画面で保存状態を診断し、IndexedDB利用可否、永続保存許可、概算使用量、支出件数、保存期間を表示します。対応ブラウザではStorage Persistence APIで永続保存をリクエストします。

CSVエクスポートは表計算用、JSONバックアップは復元用として扱います。JSONバックアップには支出、カテゴリ、設定を含めますが、容量が大きくなりやすいレシート画像Blobは含めません。

プライベートブラウズ、サイトデータ削除、端末容量不足など、ブラウザ側の判断による保存データ削除はアプリだけでは完全に防げません。

## 次フェーズのクラウド構成

```text
React PWA
  -> repository adapter
    -> IndexedDB local repository
    -> Firestore cloud repository
  -> Firebase Auth
  -> Google Vision Proxy
  -> Google Sheets export sync
```

クラウド正本化後はFirestoreを支出、カテゴリ、店舗別カテゴリルール、家計簿メンバー情報の正本にします。IndexedDBは未ログイン時の利用、初回移行元、将来のオフラインキャッシュとして扱います。

スプレッドシート同期はアプリ正本からGoogle Sheetsへの一方向エクスポートとして開始します。Sheets側で編集された内容をアプリへ取り込む双方向同期は初期対象外です。

Firebase client configは `VITE_FIREBASE_*` 環境変数から読み取り、未設定の場合はFirebaseを初期化しません。Firestoreの初期パスは `households/{householdId}` 配下に支出、カテゴリ、店舗別カテゴリルール、同期設定を置きます。Security Rules雛形は `firestore.rules` にあります。

## OCR Provider

OCRはProvider抽象を通して実行します。

- `localTesseract`: ブラウザ内でTesseract.jsを実行する既存Provider
- `googleVision`: 自前Proxy経由でGoogle Cloud Vision OCRを利用する任意Provider

どのProviderでも、OCR全文を取得した後は既存の `receiptParser.ts` で日付、店舗名、金額候補を抽出し、OCR確認画面でユーザーが修正してからIndexedDBに保存します。支出データのIndexedDB schemaは変更しません。

Google Vision利用時はレシート画像を外部サービスへ送信しますが、フロントエンドにGoogle Cloud認証情報は置かず、Proxy側でも画像やOCR全文を永続保存しません。

## OCR

OCRはTesseract.jsでブラウザ内実行します。候補抽出では「合計」「税込」「現計」「お買上計」などの周辺にある金額を優先し、保存前に確認画面でユーザー修正を必須にします。

OCR範囲は、複数プリセットを順番に試し、日付、店舗名、金額候補が最も揃う結果を自動採用できます。ユーザーが手動調整した範囲や自動採用された範囲はlocalStorageへ任意保存し、次回の初期範囲として利用します。

レシートのカテゴリ初期値は、店舗別カテゴリルールを最優先し、次に保存済み支出の店舗名とOCR候補の店舗名を正規化して照合した直近カテゴリを使います。店舗別カテゴリルールはlocalStorageのsettingsに保存し、IndexedDB schemaは変更しません。

複数レシート登録は、選択された画像をブラウザ内で順番にOCRし、確認画面で1枚ずつ修正・保存します。確認中の1枚だけ範囲を変えて再OCRできます。途中で未保存の確認キューを破棄しても、保存済み支出は残ります。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュします。
