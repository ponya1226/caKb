# Architecture

## 方針

caKbは「家計簿をつけなくていい家計簿」を中心に、撮影後のConfidence判定で通常レシートを自動保存し、例外だけを確認する構成です。ローカル利用では支出、カテゴリ、任意のレシート画像をIndexedDB、設定をlocalStorageへ保存します。クラウド家計簿ではFirestoreを正本にします。

家族共有、認証に対応するため、Firebase Hosting、Firebase Auth、Cloud Firestoreを使ってクラウド正本化しています。詳細は `docs/decisions/0005-family-cloud-ledger-direction.md` と `docs/decisions/0007-firebase-hosting-auth-migration.md` に従います。

## レイヤー

```text
React screens/components
  -> useBudgetData hook
    -> BudgetRepository
      -> IndexedDB repository
      -> Firestore repository
  -> usePendingReceiptReviews hook
    -> IndexedDB pending review store
  -> useReceiptQualityMetrics hook
    -> localStorage monthly aggregate counters
  -> OCR runner
  -> receipt parser
  -> receipt confidence assessment
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
  lineItems?: ExpenseLineItem[];
  createdByUid?: string;
  updatedByUid?: string;
  createdAt: string;
  updatedAt: string;
};
```

`Category` と `ReceiptImage` も要件通りに保持します。カテゴリは設定画面で追加、名称変更、色変更、未使用カテゴリの削除ができます。レシート画像保存OFFの場合、支出確定後の `ReceiptImage` は作成しません。Lowまたはuncertainの画像はADR 0015に従い、確認用として最大7日だけ `PendingReceiptReview` に保持します。

## IndexedDB

- DB name: `local-kakeibo-pwa`
- version: `2`
- stores:
  - `expenses`
  - `categories`
  - `receiptImages`
  - `pendingReceiptReviews`

version 1から2へのupgradeは `pendingReceiptReviews` とhousehold scope・作成・期限indexだけを追加し、既存storeとレコードを維持します。カテゴリが空の場合は初期カテゴリをseedします。

## 保存状態とバックアップ

支出、カテゴリ、任意のレシート画像は引き続きブラウザ内のIndexedDBに保存します。設定はlocalStorageに保存します。

アプリは起動時と設定画面で保存状態を診断し、IndexedDB利用可否、永続保存許可、概算使用量、支出件数、保存期間を表示します。対応ブラウザではStorage Persistence APIで永続保存をリクエストします。

CSVエクスポートは表計算用、JSONバックアップは復元用として扱います。JSONバックアップには支出、カテゴリ、設定を含めますが、容量が大きくなりやすいレシート画像Blobと要確認Inboxは含めません。バックアップ置換はInboxを暗黙削除せず、データ初期化では削除します。

プライベートブラウズ、サイトデータ削除、端末容量不足など、ブラウザ側の判断による保存データ削除はアプリだけでは完全に防げません。

## 次フェーズのクラウド構成

```text
React PWA
  -> Firebase Hosting
  -> repository adapter
    -> IndexedDB local repository
    -> Firestore cloud repository
  -> Firebase Auth
  -> Google Vision Proxy
  -> Google Sheets export sync
```

ログイン済みでactive householdがある場合はFirestoreを支出・カテゴリ・店舗別カテゴリルールの正本にし、snapshot listenerで家族の変更をリアルタイム反映します。IndexedDBとlocalStorageは未ログイン時の利用と初回移行元として扱います。

支出更新・削除では、画面が保持する `updatedAt` とFirestore上の値をtransaction内で比較します。別端末で先に更新されていた場合は保存を拒否し、最新版を確認して再編集するよう通知します。

クラウド接続状態は `online`、`offline`、`reconnecting`、`permissionDenied` に分類します。一時的な接続障害では最後に表示できたデータを維持し、未接続中の書き込みを拒否します。権限エラーだけは家計簿からの解除として再読み込み・ログアウトへ誘導します。Firestoreの永続オフラインキャッシュは共有端末への情報残留を避けるため有効化しません。

スプレッドシート同期はアプリ正本からGoogle Sheetsへのowner専用の手動一方向エクスポートです。既存Cloud Run ProxyがFirebase ID tokenとactive household ownerを確認し、Firestoreの支出を `caKb支出` タブへ1支出1行で全件再出力します。Sheets側で編集された内容をアプリへ取り込む双方向同期は対象外です。

Cloud RunはApplication Default CredentialsでSheets APIを呼びます。対象ファイルは利用者がCloud Run実行サービスアカウントへ編集共有したスプレッドシートに限定されます。service account keyやOAuth refresh tokenは保存しません。同期設定と最終結果は `households/{householdId}/sheetSyncSettings/default` に保存し、Firestore Rulesでownerだけに許可します。

Firebase client configは `VITE_FIREBASE_*` 環境変数から読み取り、未設定の場合はFirebaseを初期化しません。Firestoreの初期パスは `households/{householdId}` 配下に支出、カテゴリ、店舗別カテゴリルール、同期設定を置きます。Security Rules雛形は `firestore.rules` にあります。

アカウント画面ではログイン後にhouseholdを作成し、IndexedDB内の支出、カテゴリ、localStorage内の店舗別カテゴリルールをFirestoreへコピーできます。コピー後はFirestore cloud repositoryが正本です。クラウド家計簿のmemberにはアカウント、接続状態、参加メンバーだけを表示し、招待、移行、カテゴリ、店舗ルール、バックアップ、Sheets出力などはowner専用の管理者メニューへ集約します。

## レシート読み取り

レシート読み取りは `receiptOcr.ts` を通して実行し、Google Visionと画像全体に固定します。

- `receiptOcr.ts`: 利用画面向けの単一入口、進捗表示、設定有無の判定
- `googleVisionOcr.ts`: 自前Proxyへの画像送信、レスポンス検証、安全なエラー変換

OCR全文を取得した後は `receiptParser.ts` で日付、店舗名、金額候補と残高リスクを抽出し、`receiptConfidence.ts` が説明可能な信号から自動保存可否を決めます。High confidenceの単体レシートは `useBudgetData` 経由で自動保存し、Lowまたはuncertainだけを既存確認画面へ送ります。Lowまたはuncertainは `usePendingReceiptReviews` を通して撮影端末のInboxへ最大7日一時保存し、ホームから復元します。Proxyが返す単語と座標を使い、`receiptParser.ts` が同じ高さの単語を左から右へ並べ直して品目名と金額を対応付けます。単語座標がない場合はOCR全文による解析へ戻ります。Confidenceと理由は一時Inboxで保持し、支出・Firestoreの保存schemaは変更しません。

実際の自動保存、要確認、Undo、要確認保存時の総額変更、破棄は `useReceiptQualityMetrics` を通してhousehold別・月別の件数へ集計します。集計は最新12か月を `localStorage` に保持し、店舗名、日付、金額、品目、画像、OCR全文、支出ID、利用者識別子を含めません。管理者メニューで撮影端末の集計だけを表示し、Firestore、バックアップ、CSV、Google Sheets、外部ログへは送信しません。詳細はADR 0016に従います。

Google Vision利用時はレシート画像を外部サービスへ送信しますが、フロントエンドにGoogle Cloud認証情報は置かず、Proxy側でも画像やOCR全文を永続保存しません。Hosting環境ではFirebase ID tokenをProxyで検証し、未ログイン状態ではGoogle Vision OCRを利用できないようにします。

Proxyは認証済みUID単位の短時間レート制限と、Firestore `ocrUsage/{YYYY-MM}` のプロジェクト月間カウンタを適用します。カウンタは全Cloud Runインスタンスで共有し、画像、OCR全文、UID、メールアドレスは保存しません。

## レシート候補抽出

候補抽出では「合計」「税込」「現計」「お買上計」などの周辺にある金額を優先します。競合する強い金額、別額の残高、日付・店舗・カテゴリの未解決があれば要確認にし、安全に解決できた場合だけ自動保存します。Provider選択、範囲調整、画像補正は通常画面へ表示しません。

レシートのカテゴリ初期値は、店舗別カテゴリルールを最優先し、次に保存済み支出の店舗名とOCR候補の店舗名を正規化して照合した直近カテゴリを使います。店舗別カテゴリルールはクラウド利用時はFirestore、ローカル利用時はlocalStorageに保存し、IndexedDB schemaは変更しません。

複数レシート登録は初期の自動保存対象外です。選択された画像を順番にGoogle Visionへ送り、確認画面で1枚ずつ修正・保存します。失敗した画像だけ再試行でき、途中で未保存の確認キューを破棄しても保存済み支出は残ります。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュします。
