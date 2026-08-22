# Architecture

## 方針

caKbは「家計簿をつけなくていい家計簿」を中心に、撮影後のConfidence判定で通常レシートを自動保存し、例外だけを確認する構成です。対象は管理者が招待した特定の家族だけです。利用者向けアプリはオンライン接続、Firebase設定、Googleログイン、active householdを必須とし、支出、カテゴリ、店舗別カテゴリルールはCloud Firestoreだけを正本にします。

Firebase Hosting、Firebase Auth、Cloud Firestoreによる家族共有基盤と、ローカル家計簿へフォールバックしないアクセス制御を採用しています。未所属利用者は招待参加だけを基本とし、household初期作成はサーバー管理authorizationで許可されたownerに限定します。詳細は `docs/decisions/0005-family-cloud-ledger-direction.md`、`docs/decisions/0007-firebase-hosting-auth-migration.md`、`docs/decisions/0018-cloud-only-authenticated-ledger.md`、`docs/decisions/0019-family-only-product-scope.md` に従います。

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

アクセスゲートでは、既存memberをactive householdへ接続し、未所属の通常利用者には招待コード参加だけを表示します。初期household作成は `familyOwnerAuthorizations/{uid}` に固定household IDを事前登録されたownerだけに表示し、Rulesでも同じ条件を検証します。GoogleログインだけではFirestore利用者プロフィールを作成せず、初期作成または招待参加が成立した時点で保存します。アカウント画面ではownerだけが、IndexedDB内の旧支出・カテゴリとlocalStorage内の旧店舗別カテゴリルールをFirestoreへ明示的に移行できます。移行成功前にローカルデータは削除しません。memberにはアカウント、接続状態、参加メンバーと、この端末の匿名自動登録集計だけを表示します。招待、移行、カテゴリ、店舗ルール、バックアップ、Sheets出力、集計消去などはowner専用の管理者メニューまたは権限制御された操作へ集約します。

## レシート読み取り

レシート読み取りは `receiptOcr.ts` を通して実行し、Google Visionと画像全体に固定します。

- `receiptOcr.ts`: 利用画面向けの単一入口、進捗表示、設定有無の判定
- `googleVisionOcr.ts`: 自前Proxyへの画像送信、レスポンス検証、安全なエラー変換

OCR全文を取得した後は `receiptText.ts` で全角数字・通貨記号を正規化し、`receiptStructure.ts` が小計、税、支払総額、支払、預り、決済後、フッターの境界を分類します。`receiptShop.ts` は店舗候補の除外、正規化、ブランド・支店結合、順位付けを担当します。`receiptLineItemClassification.ts` は品目名の正規化と、商品、数量、税、決済、住所、コード、割引、集計ラベルの行分類を担当します。`receiptLineItemProfiles.ts` は店舗名ではなく、部門コード行数、税区分前置の商品コード、明示点数など複数の印字構造から限定的なPOS profileを選び、該当しない場合はgenericへ戻します。構造profileでは最初の商品コードより前の番号を品目にせず、座標復元で最初の商品金額だけが商品名より先行した場合は直前の通貨記号付き金額単独行に限定して保持します。`receiptLineItemAssociation.ts` は改行された品目名と金額の待機・対応順を管理し、`receiptLineItemSelection.ts` はOCR全文候補と座標候補を品目数・小計への一致度で比較します。`receiptParser.ts` はこれらを合成して日付、店舗名、金額候補、残高リスク、品目とは分離した税額を返し、`receiptConfidence.ts` が説明可能な信号から自動保存可否を決めます。時刻、会計券番号、電話番号は総額・品目候補から除外します。課税対象額や税込金額は税額から除外します。品目候補には同一行、前後行、割引、小計差分、単品補完、曖昧対応の取得方式を付けます。品目合計が総額、または品目合計と印字税額の合算が総額と完全一致しない場合に加え、小計差分補完または曖昧対応を含む場合も要確認にします。High confidenceの単体レシートは `useBudgetData` 経由で自動保存し、Lowまたはuncertainだけを既存確認画面へ送ります。Lowまたはuncertainは `usePendingReceiptReviews` を通して撮影端末のInboxへ最大7日一時保存し、ホームから復元します。Proxyが返す単語と座標を使い、`receiptParser.ts` が同じ高さの単語を左から右へ並べ直します。単語座標がない場合はOCR全文による解析へ戻ります。Confidenceと理由は一時Inboxで保持し、支出・Firestoreの保存schemaは変更しません。

解析品質は `receiptQualityFixtures.ts` の匿名共有コーパスを正本として、`receiptQualityEvaluation.ts` で総額一致率、期待値を持つfixtureの店名一致率、品目完全一致率、品目適合率・再現率、誤High件数、不要な要確認件数を集計します。各fixtureには店舗名とは独立した構造特徴を付け、商品金額の同一行・改行、税集計、分割合計、支払、釣銭、電子マネー残高、数値フッター、列順崩れ、部分OCRを特徴別にも評価します。決済後やフッターのうち候補へ混入してはいけない数値もfixtureへ明示し、品目・総額候補への混入0件をゲートにします。`npm run test:receipt-quality` は誤High 0件と現在サポートするfixtureの期待値をリリースゲートとして検証します。この評価はテスト時だけ実行し、実レシート、支出データ、利用者情報を保存または外部送信しません。

実際の自動保存、要確認、Undo、要確認保存時の総額変更、破棄は `useReceiptQualityMetrics` を通してhousehold別・月別・Confidence判定ルール別の件数へ集計します。集計は最新12か月を `localStorage` に保持し、店舗名、日付、金額、品目、画像、OCR全文、支出ID、household ID、利用者識別子を表示・コピー対象に含めません。旧v1集計は `legacy` 判定ルールとして読み、次回記録時にv2へ移行します。アカウント画面ではmemberを含む利用者が撮影端末の過去月を閲覧して匿名集計文をコピーでき、household ownerだけが消去できます。Firestore、バックアップ、CSV、Google Sheets、外部ログへは自動送信しません。詳細はADR 0016と0017に従います。

Google Vision利用時はレシート画像を外部サービスへ送信しますが、フロントエンドにGoogle Cloud認証情報は置かず、Proxy側でも画像やOCR全文を永続保存しません。Hosting環境ではFirebase ID tokenをProxyで検証し、未ログイン状態ではGoogle Vision OCRを利用できないようにします。

Proxyは認証済みUID単位の短時間レート制限と、Firestore `ocrUsage/{YYYY-MM}` のプロジェクト月間カウンタを適用します。カウンタは全Cloud Runインスタンスで共有し、画像、OCR全文、UID、メールアドレスは保存しません。

## レシート候補抽出

候補抽出では「合計」「税込」「現計」「お買上計」などの周辺にある金額を優先します。競合する強い金額、別額の残高、日付・店舗・カテゴリの未解決、取得済み品目と総額・税額の不一致、小計差分補完、品目と金額の曖昧対応があれば要確認にし、安全に解決できた場合だけ自動保存します。Provider選択、範囲調整、画像補正は通常画面へ表示しません。

店舗候補では、来店・利用・購入への一般的なお礼文を候補から除外します。支店名と電話番号が同じ行にある場合は行末の電話番号だけを除去して支店名を保持し、近接するブランド行と組み合わせます。実店舗名や支店名そのものを判定規則へ追加しません。

一般的なレシートの印字順は、次の領域として扱います。

1. 店舗、住所、登録番号、日時などのヘッダー
2. 商品名、商品コード、数量、単価、割引などの品目
3. 小計、課税対象額、消費税などの集計
4. 合計、現計、お買上計、請求額などの支払総額
5. 支払方法、預り金、釣銭、電子マネー残高などの決済
6. 会員ランク、ポイント、カード番号、クーポン、事業者情報などのフッター

通常の品目候補は品目領域からだけ抽出し、小計、税、支払総額、決済のいずれかへ入った後に抽出を再開しません。明示的な支払総額を認識した場合は、次の預り金から金額候補抽出も終了します。支払方法の金額は合計との重大な競合検知に利用し、支払総額が印字されていない場合はフォールバック候補にも使います。釣銭、残高または取引後フッター以降の金額は含めません。例外として、Google Visionの読み順で商品金額列だけが小計後へ移動した場合は、小計から最終支払額までの範囲に限り、印字点数、未対応品目数、連続金額、復元小計がすべて一致するときだけ補完し、要確認へ送ります。最終支払額、支払方法、預り金、釣銭、残高、フッターより後の金額をこの補完に利用しません。

レシートのカテゴリ初期値は、店舗別カテゴリルールを最優先し、次に保存済み支出の店舗名とOCR候補の店舗名を正規化して照合した直近カテゴリを使います。店舗別カテゴリルールはFirestoreに保存します。旧localStorageルールはownerの明示的な移行元としてのみ維持し、IndexedDB schemaは変更しません。

複数レシート登録は初期の自動保存対象外です。選択された画像を順番にGoogle Visionへ送り、確認画面で1枚ずつ修正・保存します。失敗した画像だけ再試行でき、途中で未保存の確認キューを破棄しても保存済み支出は残ります。

## PWA

`public/manifest.webmanifest` と `public/sw.js` を使います。service workerは同一originのGETリクエストをキャッシュしますが、アプリshellを表示できてもオンライン認証とFirestore接続が成立しなければ家計操作はできません。
