# Development History

## 2026-07-10 Roadmap and Hosting Policy Step

目的: 不具合修正後の開発方針を整理し、Firebase Hostingを正規配信先とする運用に合わせてドキュメントとworkflowを整える。

主な変更:

- 今後の開発方針を `docs/development-roadmap.md` として追加
- 短期はOCR確認体験と品目明細安定化、中期はFirestore正本化と家族共有、長期はGoogle Sheets一方向同期と品目別活用に整理
- GitHub Pages deploy workflowを `main` push対象から外し、手動実行のみへ変更
- READMEの正規確認URLとFirebase Hosting自動deploy説明を更新
- `docs/project-status.md` のFirebase Hosting、GitHub Pages、Next Recommended Prioritiesを現状に合わせて更新

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- Firestore正本化は未実装
- 家族招待、Google Sheets同期、品目別集計は今後の段階的実装対象
- GitHub PagesのRepository設定そのものを完全停止するかは未決定

## 2026-07-07 Expense Line Items Step

目的: レシートOCRで取得できる品目名と品目金額を、支出総額・店舗・カテゴリを正本にする既存家計簿を壊さずに保存できるようにする。

主な変更:

- `Expense` に任意の `lineItems` を追加し、既存データは `lineItems` なしで有効なままにした
- OCR候補抽出に品目名 + 金額の候補を追加し、合計、税、支払、釣り、電話番号、登録番号、日付、クーポン文言を除外
- OCR確認、手入力、編集フォームに折りたたみの品目明細入力を追加
- 支出一覧の詳細表示で品目数、品目合計、品目一覧を確認できるようにした
- JSONバックアップのround-trip、旧JSONバックアップ読込、CSV `lineItemsJson`、Firestoreネストフィールド移行に対応
- 保存形式変更のADR 0008を追加

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 品目別カテゴリ集計、品目別自動カテゴライズ、数量/単価、商品マスタ、Google Sheets品目別出力は未対応
- 実レシートのGoogle Vision OCR結果を使った品目候補抽出の回帰テストを継続的に増やす

## 2026-07-07 Google Vision Proxy Email Allowlist

目的: Googleログイン済みであれば誰でもGoogle Vision OCRを利用できる状態を避け、許可したFirebase Authメールアドレスだけが高精度OCRを使えるようにする。

主な変更:

- Google Vision ProxyでFirebase ID tokenの `email` を取得し、`ALLOWED_AUTH_EMAILS` と照合する処理を追加
- 許可リスト外のユーザーには `/api/ocr` で `403 Forbidden` を返す
- GitHub ActionsのCloud Run deploy workflowで `GOOGLE_VISION_ALLOWED_EMAILS` Repository secretを必須化
- Cloud Runへ `ALLOWED_AUTH_EMAILS` を環境変数として反映
- proxy認証テストにメール許可リストの正規化、許可、拒否ケースを追加

検証結果:

- `npm.cmd --prefix server\google-vision-proxy run test`
- `npm.cmd --prefix server\google-vision-proxy run build`
- `npm run test`
- `git diff --check`

残課題:

- GitHub Repository secret `GOOGLE_VISION_ALLOWED_EMAILS` に実際の許可メールを設定してからCloud Run deploy workflowを再実行する
- 将来的にはFirestore上のユーザー権限、日次/月次利用回数制限、レート制限へ拡張する

## 2026-07-07 Google Vision Proxy Auth Step

目的: Firebase Hosting上でログイン確認が通ったため、レシート画像を送信するGoogle Vision Proxyをログイン済みユーザーに限定する。

主な変更:

- Google Vision ProxyにFirebase Admin SDKを追加
- `Authorization: Bearer <Firebase ID token>` の検証を追加
- `REQUIRE_FIREBASE_AUTH` を追加し、hosted環境ではID token検証を有効にする方針に変更
- フロントエンドのGoogle Vision OCR呼び出しでFirebase ID tokenを送信
- 未ログイン状態では高精度OCRを使えないようにし、ローカルOCRへ誘導
- Proxy認証処理とAuthorization header送信の回帰テストを追加
- Google Vision Proxyのdeploy手順とCORS/env例を更新

検証結果:

- `npm run lint`
- `npm run test -- src/lib/ocrProviders.test.ts src/hooks/useFirebaseAuth.test.ts`
- `npm run test`
- `npm run build`
- `npm run test` in `server/google-vision-proxy`
- `npm run build` in `server/google-vision-proxy`
- `git diff --check`

残課題:

- Cloud RunのGoogle Vision Proxy再デプロイ
- Firebase Hosting上でログイン済み高精度OCRが通ることの実機確認
- `firebase-admin` transitive dependencyのmoderate audit警告の継続監視
- 追加防御として `OCR_SHARED_TOKEN`、Cloud Runレート制限、月間利用上限の検討

## 2026-07-07 Firebase Hosting Auth Migration Prep

目的: GitHub Pages上のスマホGoogleログインが不安定なため、Firebase Hostingへ移行して認証を安定化する準備を行う。

主な変更:

- Firebase Hosting移行ADRを追加
- `firebase.json` にHosting配信、SPA fallback、PWA/cache header設定を追加
- `.firebaserc` で `cakb-dev` を既定Firebase projectに設定
- Firebase Hosting手動deploy用GitHub Actions workflowを追加
- Firebase Hostingのauth domain上ではスマホ/PWAのGoogleログインをredirect方式に切り替える判定を追加
- GitHub Pagesなどauth domain外ではpopup方式を維持
- Firebase Hosting移行手順と今後の優先順位をREADME/docsへ反映

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- GitHub Secret `FIREBASE_SERVICE_ACCOUNT_CAKB_DEV` の設定とFirebase Hosting実deploy
- Firebase Hosting URLでのPC/スマホログイン検証
- Google Vision ProxyのFirebase ID token検証
- Firestore cloud repositoryへの正本切替
- Firebase Hosting検証完了後のGitHub Pages workflow停止

## 2026-07-05 Household Creation and Migration UI Step

目的: Firebase Authログイン後にクラウド家計簿を作成し、既存IndexedDBデータを明示操作でFirestoreへコピーできる入口を追加する。

主な変更:

- Firestore上にhouseholdとowner memberを作成する処理を追加
- ログインユーザーのmember recordから既存householdを取得する処理を追加
- IndexedDB内の支出、カテゴリ、店舗別カテゴリルールをhousehold配下へコピーする移行処理を追加
- 設定画面にクラウド家計簿作成UIとローカルデータ移行UIを追加
- Firestore Rulesをmember検索とowner member作成に対応
- household/cloud migration変換の回帰テストを追加

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 移行後もアプリの支出登録・一覧・編集はIndexedDBを正本として使用
- Firestore cloud repositoryへの正本切替は未実装
- 家族招待、member権限UI、Firestore Rules testは未実装

## 2026-07-05 Firebase Auth UI Step

目的: Firestore正本化の前段として、Firebase設定済み環境でGoogleログイン/ログアウトできるUIを追加し、ログイン成功時にユーザーprofileをFirestoreへ作成できるようにする。

主な変更:

- Firebase Auth状態を扱う `useFirebaseAuth` hookを追加
- Googleログイン/ログアウト処理を追加
- 設定画面にアカウントセクションを追加
- ログイン成功時に `users/{uid}` profileを作成/更新
- Firebase未設定時は従来どおりIndexedDB正本で動作し、ログインボタンを無効化
- user profile変換の回帰テストを追加

検証結果:

- `npm run lint`
- `npm run test -- src/lib/userProfile.test.ts src/lib/firebaseConfig.test.ts src/lib/firestorePaths.test.ts`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 支出データの保存先はまだIndexedDB
- Firestore cloud repositoryとIndexedDBからの手動移行UIは未実装
- household作成、家族招待、Google Vision ProxyのID token検証は未実装

## 2026-07-05 Firebase Foundation Step

目的: 家族共有とクラウド正本化へ進むため、現行ローカル動作を維持したままFirebase Auth / Firestoreの最小土台を追加する。

主な変更:

- Firebase Web SDKを追加
- Firebase client configを `VITE_FIREBASE_*` から読み取る初期化層を追加
- Firestore path定義と回帰テストを追加
- `BudgetRepository` interfaceと `localBudgetRepository` を追加し、既存IndexedDB処理をRepository境界へ寄せた
- Firestore Security Rules雛形、`firebase.json`、Firebase初期設定ドキュメントを追加
- Firebase / Firestore土台追加のADRを追加

検証結果:

- `npm run lint`
- `npm run test -- src/lib/firebaseConfig.test.ts src/lib/firestorePaths.test.ts`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- Firebase AuthログインUIは未実装
- Firestore cloud repositoryとIndexedDBからの移行UIは未実装
- Firestore Security Rulesは雛形段階で、Rules testやEmulator検証は未実施
- Google Vision ProxyのFirebase ID token検証は未実装

## 2026-07-05 Family Cloud Direction and Local Analysis Step

目的: 家族共有、認証、既存スプレッドシート同期へ進む前に、クラウド正本化の方針をADRとして固め、同時にクラウド化前でも使えるカテゴリ自由作成と年間支出一覧を追加する。

主な変更:

- 家族共有向けクラウド正本化方針ADRを追加
- 次フェーズの第一候補をFirebase Auth、Cloud Firestore、Google Sheets一方向同期として整理
- 設定画面にカテゴリ追加、名称変更、色変更、未使用カテゴリ削除を追加
- 年間支出画面を追加し、年間合計、レシート登録分、月別支出、カテゴリ別年間支出、年間明細を表示
- 年間集計ロジックと回帰テストを追加
- architectureとproject statusを次フェーズ方針に合わせて更新

検証結果:

- `npm run lint`
- `npm run test -- src/lib/yearlyStats.test.ts`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- Firebase Auth、Firestore、家族共有、Google Sheets同期は方針整理のみで未実装
- 使用中カテゴリの統合や一括付け替えは未対応
- Sheets双方向同期、レシート画像のクラウド保存は初期対象外

## 2026-07-05 OCR Candidate Flow and Branch Matching Step

目的: Google Vision OCRを使う実運用で、候補選択の状態を見分けやすくし、高精度OCRを自然に使える導線にしつつ、同じ店舗ブランドの支店違いでもカテゴリ推定が効くようにする。

主な変更:

- OCR後の日付、店舗名、金額候補で選択中の候補を強調表示
- Google Vision OCR設定済みの場合は高精度OCRを初期選択し、OCR実行ボタンにも反映
- OCR方式の選択肢で高精度OCRを先に表示し、推奨であることを明示
- 店舗カテゴリ推定で、正規化一致と部分一致に加え、共通するブランド接頭辞が十分長い場合を同系列店舗として扱うように変更
- 支店名が異なる店舗カテゴリ推定の回帰テストを追加

検証結果:

- `npm run test -- src/lib/categorySuggestion.test.ts`
- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 店舗ブランド判定はヒューリスティックのため、誤適用があれば匿名化した実例をもとに調整する
- Google Vision Proxyの利用制限として `OCR_SHARED_TOKEN` などの導入は別ステップで対応する

## 2026-07-05 Shop Category Rules Step

目的: Google Vision OCRで文字認識精度が改善したため、保存時に店舗別カテゴリルールを作成し、次回以降のカテゴリ初期値を安定させる。

主な変更:

- `AppSettings.shopCategoryRules` を追加し、localStorageとJSONバックアップ/復元の対象にした
- OCR確認画面に「この店舗のカテゴリを次回も使う」チェックを追加
- 設定画面に店舗別カテゴリルールの追加、カテゴリ変更、削除UIを追加
- カテゴリ初期値は店舗別カテゴリルールを保存済み支出履歴より優先するように変更
- 店舗名揺れを許容したカテゴリルールの回帰テストを追加
- 保存形式変更のADRとして `docs/decisions/0004-shop-category-rules.md` を追加

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 店舗別カテゴリルールは店舗名の正規化一致と部分一致に基づくため、誤適用があれば実機結果に合わせて調整する
- 店舗名そのものを編集するUIは未実装。現時点では削除して再追加する

## 2026-07-05 Google Vision Candidate Tuning

目的: Google Vision OCRで文字認識精度が改善したため、OCR後の店舗名候補とカテゴリ初期値の精度を上げる。

主な変更:

- 店舗候補抽出でブランド行と支店行を結合した候補を優先
- 支店名だけの候補が先頭に出にくいように調整
- 英字ロゴ行と日本語ブランド行が併存する場合は日本語ブランド行を優先
- 合計、預かり金、お釣りが別行になるレシートで合計金額を優先
- 円記号が `\` として認識された金額行でも合計を優先
- 保存済み店舗名によるカテゴリ推定で、ブランド名のみと支店名込みの揺れを許容
- 匿名化したGoogle Vision OCR風テキストの回帰テストを追加
- PWA更新後に古いchunkを参照して白画面になる問題を抑えるため、service workerをnetwork-firstへ変更
- React ErrorBoundaryを追加し、描画例外時に再読み込み導線を表示

検証結果:

- `npm run test -- src/lib/receiptParser.test.ts`
- `npm run test -- src/lib/categorySuggestion.test.ts`
- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 店舗別カテゴリルールをユーザーが明示的に管理するUIは未実装
- 店舗候補抽出はヒューリスティックのため、実レシート結果を匿名化して継続的にテストへ追加する必要がある
- PWA更新直後に既に開いている古い画面は、必要に応じてユーザーが再読み込みする必要がある

## 2026-07-05 Google Vision Proxy Deploy Prep

目的: Google Cloud側の基本準備完了後、caKbのGoogle Vision OCR ProxyをCloud Runへデプロイし、GitHub Pagesから疎通確認できる状態に近づける。

主な変更:

- Google Vision Proxyにproduction用 `start` scriptを追加
- TypeScriptを `dist/` へ出力するbuild設定を追加
- Cloud Run向けDockerfileと `.dockerignore` を追加
- Google Vision Proxyの `@google-cloud/vision` を更新し、本番依存のaudit警告を解消
- GitHub Pages workflowで `VITE_GOOGLE_VISION_PROXY_URL` をRepository variableからbuildへ渡すように変更
- Cloud Runデプロイ手順を `docs/google-vision-proxy-deploy.md` に追加
- READMEとプロジェクト状態ドキュメントを更新

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm --prefix server/google-vision-proxy run build`
- `npm --prefix server/google-vision-proxy run test`
- `npm --prefix server/google-vision-proxy audit --omit=dev`
- `git diff --check`

残課題:

- Cloud Run実デプロイとGoogle Vision実API疎通はユーザー環境で実施が必要
- `OCR_SHARED_TOKEN` は疎通確認後に追加する
- 公開Proxyの利用制限、監査、月間利用量確認手順は次ステップで整備する

## 2026-07-04 Google Vision OCR Provider Phase 1

目的: Tesseract.jsだけでは実レシートOCR精度が不足するため、Google Vision OCRを任意の高精度OCR Providerとして追加し、Tesseract.jsをフォールバックとして残す。

主な変更:

- Google Vision OCR導入ADRを追加
- OCR Provider型を追加し、localTesseract / googleVision を同じ後段フローへ接続
- Google Vision Proxy呼び出しクライアントを追加
- レシート登録画面にOCR方式選択と外部送信注意表示を追加
- OCR確認画面に読み取り方式表示を追加
- Node.js + TypeScriptのGoogle Vision Proxyサンプルを追加
- Proxy入力バリデーションとOCR Provider抽象のテストを追加

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- Google Cloud実API接続は未検証。Cloud Run、Vision API、認証、CORS、予算アラート設定が必要
- Proxyの本番運用ではレート制限、月間上限、認証強化が必要
- Document AI Expense Parserとの比較は未実施

## 2026-07-04 Persistence and Historical Dashboard Step

目的: ブラウザ終了後もデータが残る前提をユーザーが確認できるようにし、過去月の支出をダッシュボードで確認できるようにする。

主要変更:

- ダッシュボードに対象月セレクトを追加し、月次合計、前月比、カテゴリ別支出、日別推移を選択月ベースで表示
- 保存状態診断を追加し、IndexedDB利用可否、永続保存許可、概算使用量、支出件数、保存期間を設定画面に表示
- Storage Persistence APIを利用し、可能なブラウザでは永続保存をリクエスト
- JSONバックアップとJSON復元を追加し、CSVとは別に支出、カテゴリ、設定を復元可能にした
- ダッシュボード集計とJSONバックアップの回帰テストを追加

検証結果:

- `npm run lint`
- `npm run test`

残課題:

- プライベートブラウズ、サイトデータ削除、端末容量不足によるブラウザ側の削除はアプリだけでは完全に防げない
- レシート画像BlobはJSONバックアップ対象外。必要になった場合は容量と復元UXを別途検討する
- 別端末共有やクラウド同期は未対応

## 2026-07-04 OCR Preprocess Variant Step

目的: 範囲調整だけでは改善しないレシートに対し、Tesseractへ渡す画像自体をOCR向けに補正し、検証中に補正後画像を確認できるようにする。

主要変更:

- OCR前処理に高コントラスト、二値化、太字化の補正モードを追加
- OCR入力画像の周囲へ白余白を追加し、端の文字欠けを抑えるように変更
- 自動OCR候補に二値化補正と太字補正を追加し、既存スコアで比較
- 採用されたOCR入力画像を登録画面と確認画面の折りたたみUIで確認できるようにした
- OCR入力画像URLをドラフトに保持し、画面遷移や再OCR時にrevokeするように変更
- 支払金額が読めている場合に、欠けた合計行より支払行を優先する回帰テストを追加

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 二値化や太字化が強すぎる画像では文字が潰れる可能性があるため、補正画像UIで実機確認が必要
- 傾き補正、台形補正、別OCRエンジンの検討は未対応

## 2026-07-04 Long Receipt Auto Crop Adjustment

目的: クーポンや長い下部領域を含むレシートで、会計本体が小さくOCRへ渡されて精度が落ちる問題を抑える。

主要変更:

- 自動検出したOCR範囲が縦に長すぎる場合、下部を控えめに除外して会計本体を大きく扱うように変更
- 用紙検出そのものは維持し、矩形範囲の初期値だけを長いレシート向けに調整

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 下部に合計がある特殊なレシートでは、ユーザーが範囲を手動で広げる必要がある
- 傾き補正や台形補正は未対応

## 2026-07-04 Per Image OCR Crop Step

目的: 複数レシート選択時に画像ごとの撮影位置差でOCR範囲が合わなくなる問題を抑え、自動検出した範囲をユーザーが確認・微調整できるようにする。

主要変更:

- 登録画面で選択画像ごとにOCR範囲、OCRモード、補正設定を保持するように変更
- 複数選択時にサムネイルで調整対象の画像を切り替えられるUIを追加
- 画像選択後に用紙または文字領域を自動検出し、OCR範囲プレビューへ反映
- 複数OCRでは各画像が保持する範囲を使って順番にOCRするように変更
- 現在の範囲を全画像に適用する補助ボタンを追加
- 範囲検出中はOCR実行を待たせ、既定範囲で先に実行されることを防止

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 用紙検出は矩形範囲のみで、傾き補正や台形補正は未対応
- 複数枚で画像ごとに範囲を調整できるが、画像ごとの再OCRは確認画面で1枚ずつ行う必要がある

## 2026-07-04 Manual Crop Preprocess and Amount Recovery Fix

目的: 手動でOCR範囲を調整した場合でも補正ありOCRを標準にし、1,000円表記のOCR崩れから金額候補を復元しやすくする。

主要変更:

- 登録画面とOCR確認画面で、画像上の範囲調整とスライダー調整を「手動補正」として扱うように変更
- 複数選択OCRで表示中の範囲を使う場合も補正ありOCRを適用
- `¥1, 00C`、`¥1, 00¢`、`¥1, 0(` のような金額崩れを架空データの回帰テストに反映

検証結果:

- `npm run lint`
- `npm run test`

残課題:

- 補正あり手動範囲の実機OCR結果を確認し、必要に応じて補正強度を調整する

## 2026-07-04 OCR Amount and Batch Range Fix

目的: OCR結果から1,000円候補が電話番号などに負ける問題と、複数枚OCRで表示中の選択範囲が反映されない問題を修正する。

主要変更:

- 通貨記号付きの金額候補を、電話番号や住所由来の数値より優先するように変更
- `¥1, 0(` のようなOCR崩れを1,000円候補として復元する金額正規化を追加
- 複数選択OCRでは、表示中のOCR範囲をすべての画像に固定適用するように変更
- 複数選択時の補助説明文を、表示中の範囲を適用する文言に変更
- 架空レシート文面で金額候補の回帰テストを追加

検証結果:

- `npm run lint`
- `npm run test`

残課題:

- 複数枚OCRでは画像ごとの自動範囲最適化より、ユーザーが指定した範囲の一貫性を優先している
- 実機で複数画像に同じ範囲を適用したときの精度差を継続確認する

## 2026-07-04 Direct OCR Crop Adjustment Step

目的: OCR範囲調整をスライダーだけに頼らず、画像上で直接操作できるようにしてスマホでの調整負担を下げる。

主要変更:

- OCR範囲プレビューを共通コンポーネント化
- 枠内ドラッグでOCR範囲全体を移動できるようにした
- 上下左右の小型ハンドルを枠線上に配置し、ドラッグして範囲端を直接調整できるようにした
- 登録画面とOCR確認画面の両方で直接調整UIを利用
- スライダー、範囲プリセット、自動範囲設定を補助設定として折りたたみに変更
- クロップ定数と補助関数を軽量な `src/lib/ocrCrop.ts` に分離

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 実機タッチ操作でハンドルサイズとドラッグ感度を確認する
- スライダーは補助操作として残しているため、今後の実機結果に応じて表示密度を調整する

## 2026-07-04 Batch OCR Stability Step

目的: 単体OCRと複数枚OCRで同じ画像の認識精度が変わる問題を抑え、OCR候補選択を状態に依存しにくくする。

主要変更:

- 自動OCR候補から前回保存クロップを除外し、固定候補だけで比較するように変更
- 前回保存クロップは手動プリセットとしてのみ利用可能に維持
- 複数枚OCR中に、各レシートの採用クロップで画面状態や保存済みクロップを上書きしないように変更
- 単体と複数枚で同じOCR候補セットを使いやすくした

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 実機で同一画像を単体/複数枚の両方で再確認し、出力差が解消しているか確認する
- 複数枚OCRの待ち時間と精度のバランスは継続調整が必要

## 2026-07-04 Receipt Paper Detection Step

目的: 明るい背景や反射、細かい模様を文字として拾ってしまうOCR結果を抑え、白いレシート用紙内の文字を優先して読み取る。

主要変更:

- OCR前処理で白い用紙らしい連結領域を検出し、見つかった場合はその範囲を優先して切り出すように変更
- 用紙領域が検出できない場合は従来の文字領域検出へフォールバック
- 補正ありOCRではTesseract.jsのページ分割を単一ブロック寄りに設定
- 複数OCR候補の採用スコアで、過剰に長いノイズ混じり結果を選びにくくした

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 傾き補正、台形補正、撮影時の影への対策は未対応
- 背景と用紙の明度差が小さい画像では、用紙検出が文字領域検出へフォールバックする可能性がある
- 実機OCRで今回の閾値を確認し、必要に応じて白紙判定条件を調整する

## 2026-07-04 OCR Image Preprocessing Step

目的: レシート外の背景や余白にTesseract.jsが引っ張られてOCR結果が不安定になる問題を減らし、スキャン範囲の手動調整なしでも読み取り候補を作りやすくする。

主要変更:

- OCR前に文字領域を自動検出し、対象範囲を寄せてから拡大する画像前処理を追加
- グレースケール化とコントラスト補正を行うOCR用画像を生成
- 自動OCR候補に「用紙補正」「本体補正」「下部除外補正」を追加し、通常候補とスコアで比較
- 確認画面の再OCRでも補正ありプリセットを保持できるようにした

検証結果:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 傾き補正、台形補正、二値化閾値の最適化は未対応
- 実機の複数店舗・複数撮影条件で、補正あり候補がどの程度安定するか追加確認が必要
- 補正候補を増やしたため、自動OCRは従来より時間がかかる可能性がある

## 2026-07-04 Bulk OCR Retry Step

目的: 複数レシート一括登録中に、OCR結果が悪い1枚だけ範囲調整して再OCRできない問題を解消する。

主な変更:

- OCR範囲プリセットと自動比較処理を共有ライブラリ化
- OCR確認画面に範囲プリセット、スライダー、再OCRボタンを追加
- 一括確認キュー内の現在の1枚だけを再OCRし、候補と初期入力値を更新
- 再OCRで採用された範囲を次回初期値として保存

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 再OCRは確認中の1枚単位で、複数枚全体の一括再処理は未対応
- 傾き補正、台形補正、二値化などの画像前処理は未実装

## 2026-07-04 OCR Range Stabilization Step

目的: OCR精度がスキャン範囲調整に強く依存する問題に対し、手動調整の負担を下げつつ候補抽出の安定性を上げる。

主な変更:

- 自動OCRモードで複数の範囲プリセットを順番にOCRし、候補スコアが最も高い結果を採用
- 日付、店舗名、金額候補の揃い具合を採点する関数を追加
- `全体`、`本体`、`下部除外`、`中央寄せ`、`前回` の範囲プリセットを追加
- 自動採用された範囲や手動調整範囲をlocalStorageへ保存し、次回の初期範囲に利用
- OCR範囲を「既定にする」操作を追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 自動OCRは複数回OCRするため、処理時間が増える
- 傾き補正、台形補正、二値化などの画像前処理は未実装
- OCRエンジンは引き続きTesseract.jsを使用

## 2026-07-04 Bulk Receipt and Category Learning Step

目的: 今後の開発方針に沿って、複数レシート登録、店舗名ベースの自動カテゴライズ、ダッシュボードでのレシート登録分確認をMVP範囲内で追加する。

主な変更:

- 複数画像を選択して順番にOCRし、確認画面で1枚ずつ保存できるキューを追加
- 保存済み支出の店舗名から、同じ店舗名の直近カテゴリをレシート確認画面の初期値へ反映
- ダッシュボードにレシート登録分の月次合計と件数を追加
- OCRノイズの強いヘッダー行を店舗名候補から除外
- 自動カテゴライズとOCRノイズ除外の回帰テストを追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- 自動カテゴライズは店舗名一致のみで、商品名や明細内容は考慮しない
- 複数レシートOCRは逐次処理のため、枚数が多い場合の待ち時間は残る
- 失敗画像の再試行UIやカテゴリルール編集UIは未実装

## 2026-07-03 Online Verification Step

目的: ローカル開発サーバーではなく、オンラインURLでMVPを確認できるようにする。

主な変更:

- `main` push時にlint、test、build、Pages deployを行うGitHub Actions workflowを追加
- Vite build asset path、PWA manifest、favicon、service worker登録をGitHub Pagesの `/caKb/` サブパスでも動くように調整
- 静的GitHub Pages公開のADRを追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

残課題:

- 初回公開後、GitHub ActionsとPages設定の状態確認が必要
- 公開URLで保存したデータは、そのURLを開いたブラウザ内のIndexedDB/localStorageに保存される

## 2026-07-02 OCR Candidate Tuning Step

目的: 実機OCR結果で主要情報は読めているが文字崩れが残る状態に対して、候補抽出側で日付、店舗名、金額を拾いやすくする。

主な変更:

- 匿名化したOCR結果を回帰テストに追加
- 年表記の一部が欠けた日本語日付表記を候補化
- 崩れた支払行や金額表記から金額候補を優先
- 電話番号、登録番号、伝票番号、日付行を金額フォールバックから除外
- 崩れた店舗名表記を候補として補正
- 複数段階のOCR改善結果を、架空の店舗、住所、番号、商品、金額に置き換えて回帰テスト化

検証:

- `npm run lint`
- `npm run test`

残課題:

- 店舗名補正は限定的なヒューリスティックで、店舗網羅は未対応
- OCR自体の読み取り精度は画像状態と範囲指定に依存する

## 2026-07-02 OCR Debug Step

目的: 実レシート検証でOCR結果のノイズが大きい問題に対して、無料・ローカル方針を維持したまま検証と修正をしやすくする。

主な変更:

- OCR結果全文をレシート登録画面とOCR確認画面からコピーできるように変更
- OCR対象範囲を上、下、左、右のスライダーで指定できるUIを追加
- 下部クーポンや左右背景を除外しやすい「本体」プリセットを追加
- 精度が悪化した自動クロップ、強い画像補正、Worker API切り替えは採用せず、基本のTesseract.js `recognize()` に戻した

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- OCR範囲指定は矩形のみで、傾き補正や台形補正は未対応
- 実レシート画像ごとの精度差は残る

## 2026-07-02 Search Filter OCR Test Step

目的: 次フェーズとして、支出一覧の探索性、OCR候補抽出の検証、レシート画像選択時の容量確認を改善する。

主な変更:

- 支出一覧に店舗名、メモ、カテゴリ名を対象にした検索入力を追加
- 支出一覧に「すべて」を初期値とするカテゴリフィルタを追加
- 月別表示を維持し、検索条件とカテゴリフィルタをAND条件で適用
- 検索結果0件時の空状態メッセージを追加
- レシート登録画面に選択画像のファイルサイズ表示を追加
- 5MB超の画像にOCR時間の注意表示を追加
- OCR候補抽出テストを9件に拡充

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

残課題:

- レシート画像の圧縮、リサイズは未実装
- 検索条件のURL query化や永続化は未実装

## 2026-07-02 Performance Step

目的: 初期表示のバンドル負荷を下げる。

主な変更:

- 主要画面を `React.lazy` と `Suspense` で遅延読み込み化
- Tesseract.jsを含むレシート登録画面を、レシート画面表示時まで分離
- Rechartsを含むダッシュボードを画面チャンクへ分離
- 画面読み込み中の表示を追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

## 2026-07-02

目的: 家計簿PWAのMVPを新規作成する。

主な変更:

- React + TypeScript + Viteの新規構成を追加
- IndexedDB repositoryと初期カテゴリseedを追加
- ダッシュボード、支出一覧、レシート登録、OCR確認、設定画面を追加
- Tesseract.js OCRと候補抽出を追加
- CSVエクスポート、データ初期化、PWA manifest/service workerを追加
- 初期開発ドキュメント、ADR、規約を追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
