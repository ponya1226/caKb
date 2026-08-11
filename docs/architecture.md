# Architecture

## 方針

caKbは「家計簿をつけなくていい家計簿」を中心に、撮影後のConfidence判定で通常レシートを自動保存し、例外だけを確認する構成です。利用者向けアプリはオンライン接続、Firebase設定、Googleログイン、active householdを必須とし、支出、カテゴリ、店舗別カテゴリルールはCloud Firestoreだけを正本にします。

Firebase Hosting、Firebase Auth、Cloud Firestoreによる家族共有基盤と、ローカル家計簿へフォールバックしないアクセス制御を採用しています。詳細は `docs/decisions/0005-family-cloud-ledger-direction.md`、`docs/decisions/0007-firebase-hosting-auth-migration.md`、`docs/decisions/0018-cloud-only-authenticated-ledger.md` に従います。

## レイヤー

```text
React screens/components
  -> cloud access gate
    -> browser online state
    -> Firebase Auth
    -> active household
  -> useBudgetData hook
    -> BudgetRepository
      -> Firestore repository (user-facing source of truth)
      -> IndexedDB repository (legacy migration and test harness only)
  -> usePendingReceiptReviews hook
    -> IndexedDB pending review store
  -> useReceiptQualityMetrics hook
    -> localStorage monthly and confidence-policy aggregate counters
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

`Category` もFirestoreへ保持し、設定画面で追加、名称変更、色変更、未使用カテゴリの削除ができます。通常のクラウド保存では確定後の `ReceiptImage` を作成しません。Lowまたはuncertainの画像はADR 0015に従い、確認用として最大7日だけ端末内の `PendingReceiptReview` に保持します。

## IndexedDB

- DB name: `local-kakeibo-pwa`
- version: `2`
- stores:
  - `expenses`
  - `categories`
  - `receiptImages`
  - `pendingReceiptReviews`

version 1から2へのupgradeは `pendingReceiptReviews` とhousehold scope・作成・期限indexだけを追加し、既存storeとレコードを維持します。`expenses`、`categories`、`receiptImages` は旧ローカル家計簿の移行元と自動テスト用として残しますが、利用者向け通常操作の保存先にはしません。

## 保存状態とバックアップ

支出、カテゴリ、店舗別カテゴリルールはFirestoreへ保存します。設定と匿名品質集計はlocalStorage、要確認InboxはIndexedDBへ保存します。未認証、household未確定、オフライン、再接続中に支出をIndexedDBへ代替保存しません。

CSVエクスポートは表計算用、JSONバックアップは復元用として、Firestoreから取得した現在の家計簿データを対象にします。JSONバックアップには支出、カテゴリ、設定を含めますが、レシート画像Blobと要確認Inboxは含めません。バックアップ置換はInboxを暗黙削除せず、データ初期化では削除します。

要確認Inboxと品質集計は端末固有です。プライベートブラウズ、サイトデータ削除、端末容量不足などで削除される可能性がありますが、確定済み支出の正本はFirestoreに残ります。

## クラウド構成

```text
React PWA
  -> Firebase Hosting
  -> Firebase Auth
  -> active household access gate
  -> Firestore BudgetRepository
  -> Google Vision Proxy
  -> Google Sheets export sync
```

オンラインでGoogleログイン済みかつactive householdがある場合だけ通常画面を表示します。Firestoreを支出・カテゴリ・店舗別カテゴリルールの正本にし、snapshot listenerで家族の変更をリアルタイム反映します。IndexedDBの既存支出とカテゴリ、localStorageの既存店舗ルールはownerが明示的に実行する旧データ移行の入力としてだけ扱います。

支出更新・削除では、画面が保持する `updatedAt` とFirestore上の値をtransaction内で比較します。別端末で先に更新されていた場合は保存を拒否し、最新版を確認して再編集するよう通知します。

クラウド接続状態は `online`、`offline`、`reconnecting`、`permissionDenied` に分類します。`online` 以外では家計画面全体を遮断し、再接続またはログアウトへ誘導します。未接続中の書き込み、オフラインキュー、ローカル代替保存は行いません。Firestoreの永続オフラインキャッシュは共有端末への情報残留を避けるため有効化しません。

スプレッドシート同期はアプリ正本からGoogle Sheetsへのowner専用の手動一方向エクスポートです。既存Cloud Run ProxyがFirebase ID tokenとactive household ownerを確認し、Firestoreの支出を `caKb支出` タブへ1支出1行で全件再出力します。Sheets側で編集された内容をアプリへ取り込む双方向同期は対象外です。

Cloud RunはApplication Default CredentialsでSheets APIを呼びます。対象ファイルは利用者がCloud Run実行サービスアカウントへ編集共有したスプレッドシートに限定されます。service account keyやOAuth refresh tokenは保存しません。同期設定と最終結果は `households/{householdId}/sheetSyncSettings/default` に保存し、Firestore Rulesでownerだけに許可します。

Firebase client configは `VITE_FIREBASE_*` 環境変数から読み取ります。未設定の場合はローカル家計簿へ切り替えず、設定不足画面を表示します。Firestoreのパスは `households/{householdId}` 配下に支出、カテゴリ、店舗別カテゴリルール、同期設定を置きます。Security Rulesは `firestore.rules` にあります。

アクセスゲートではGoogleログイン後にhouseholdを作成または招待コードで参加できます。アカウント画面ではownerだけが、IndexedDB内の旧支出・カテゴリとlocalStorage内の旧店舗別カテゴリルールをFirestoreへ明示的に移行できます。移行成功前にローカルデータは削除しません。memberにはアカウント、接続状態、参加メンバーと、この端末の匿名自動登録集計だけを表示します。招待、移行、カテゴリ、店舗ルール、バックアップ、Sheets出力、集計消去などはowner専用の管理者メニューまたは権限制御された操作へ集約します。

## レシート読み取り

レシート読み取りは `receiptOcr.ts` を通して実行し、Google Visionと画像全体に固定します。

- `receiptOcr.ts`: 利用画面向けの単一入口、進捗表示、設定有無の判定
- `googleVisionOcr.ts`: 自前Proxyへの画像送信、レスポンス検証、安全なエラー変換

OCR全文を取得した後は `receiptParser.ts` で日付、店舗名、金額候補と残高リスクを抽出し、`receiptConfidence.ts` が説明可能な信号から自動保存可否を決めます。High confidenceの単体レシートは `useBudgetData` 経由で自動保存し、Lowまたはuncertainだけを既存確認画面へ送ります。Lowまたはuncertainは `usePendingReceiptReviews` を通して撮影端末のInboxへ最大7日一時保存し、ホームから復元します。Proxyが返す単語と座標を使い、`receiptParser.ts` が同じ高さの単語を左から右へ並べ直して品目名と金額を対応付けます。単語座標がない場合はOCR全文による解析へ戻ります。Confidenceと理由は一時Inboxで保持し、支出・Firestoreの保存schemaは変更しません。

実際の自動保存、要確認、Undo、要確認保存時の総額変更、破棄は `useReceiptQualityMetrics` を通してhousehold別・月別・Confidence判定ルール別の件数へ集計します。集計は最新12か月を `localStorage` に保持し、店舗名、日付、金額、品目、画像、OCR全文、支出ID、household ID、利用者識別子を表示・コピー対象に含めません。旧v1集計は `legacy` 判定ルールとして読み、次回記録時にv2へ移行します。アカウント画面ではmemberを含む利用者が撮影端末の過去月を閲覧して匿名集計文をコピーでき、household ownerだけが消去できます。Firestore、バックアップ、CSV、Google Sheets、外部ログへは自動送信しません。詳細はADR 0016と0017に従います。

Google Vision利用時はレシート画像を外部サービスへ送信しますが、フロントエンドにGoogle Cloud認証情報は置かず、Proxy側でも画像やOCR全文を永続保存しません。Hosting環境ではFirebase ID tokenをProxyで検証し、未ログイン状態ではGoogle Vision OCRを利用できないようにします。

Proxyは認証済みUID単位の短時間レート制限と、Firestore `ocrUsage/{YYYY-MM}` のプロジェクト月間カウンタを適用します。カウンタは全Cloud Runインスタンスで共有し、画像、OCR全文、UID、メールアドレスは保存しません。

## レシート候補抽出

候補抽出では「合計」「税込」「現計」「お買上計」などの周辺にある金額を優先します。競合する強い金額、別額の残高、日付・店舗・カテゴリの未解決があれば要確認にし、安全に解決できた場合だけ自動保存します。Provider選択、範囲調整、画像補正は通常画面へ表示しません。

レシートのカテゴリ初期値は、店舗別カテゴリルールを最優先し、次に保存済み支出の店舗名とOCR候補の店舗名を正規化して照合した直近カテゴリを使います。店舗別カテゴリルールはFirestoreに保存します。旧localStorageルールはownerの明示的な移行元としてのみ維持し、IndexedDB schemaは変更しません。

複数レシート登録は初期の自動保存対象外です。選択された画像を順番にGoogle Visionへ送り、確認画面で1枚ずつ修正・保存します。失敗した画像だけ再試行でき、途中で未保存の確認キューを破棄しても保存済み支出は残ります。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュしますが、アプリshellを表示できてもオンライン認証とFirestore接続が成立しなければ家計操作はできません。
