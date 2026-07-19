# Google Vision Proxy Deploy

caKbでGoogle Vision OCRを使うための、Cloud Run Proxy疎通確認手順です。

## 前提

完了済み:

- Google Cloudプロジェクト作成
- Billing有効化
- Vision API有効化
- 予算アラート設定

Google Vision ProxyはFirebase ID tokenとactive household membershipを検証します。Cloud Run自体はブラウザから呼び出すため `--allow-unauthenticated` にしますが、`POST /api/ocr` は未ログイン利用者に401、household外の利用者に403を返します。

## 1. Cloud Shellを開く

Google Cloud Console右上のCloud Shellを開きます。

## 2. リポジトリを取得する

```bash
git clone https://github.com/ponya1226/caKb.git
cd caKb/server/google-vision-proxy
```

## 3. プロジェクトとリージョンを設定する

`YOUR_PROJECT_ID` は作成済みのGoogle CloudプロジェクトIDへ置き換えてください。

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region asia-northeast1
```

## 4. Cloud Run用サービスアカウントを作る

```bash
gcloud iam service-accounts create cakb-vision-proxy \
  --display-name="caKb Vision Proxy"
```

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:cakb-vision-proxy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudvision.user"
```

household membership確認と月間利用量カウンタ更新のため、同じ実行サービスアカウントへFirestore読み書き権限を付与します。

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:cakb-vision-proxy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

すでに同名のサービスアカウントがある場合は、作成コマンドはスキップして構いません。

## 5. Cloud Runへデプロイする

```bash
gcloud run deploy cakb-google-vision-proxy \
  --source . \
  --allow-unauthenticated \
  --service-account="cakb-vision-proxy@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --set-env-vars="^~^CORS_ORIGINS=https://cakb-dev.web.app,https://cakb-dev.firebaseapp.com,https://ponya1226.github.io~REQUIRE_FIREBASE_AUTH=true~REQUIRE_HOUSEHOLD_MEMBERSHIP=true~FIREBASE_PROJECT_ID=YOUR_PROJECT_ID~MAX_IMAGE_BYTES=5242880~OCR_RATE_LIMIT_MAX_REQUESTS=10~OCR_RATE_LIMIT_WINDOW_SECONDS=60~OCR_MONTHLY_LIMIT=900"
```

表示されたService URLを控えます。フロントエンドで使うURLは末尾に `/api/ocr` を付けたものです。

例:

```text
https://cakb-google-vision-proxy-xxxxx-an.a.run.app/api/ocr
```

## 6. ヘルスチェックする

Service URLが以下だとします。

```text
https://cakb-google-vision-proxy-xxxxx-an.a.run.app
```

Cloud Shellで確認します。

```bash
curl https://cakb-google-vision-proxy-xxxxx-an.a.run.app/health
```

次のように返ればProxy自体は起動しています。

```json
{"ok":true}
```

## 7. フロントエンドビルドへProxy URLを渡す

GitHubの `ponya1226/caKb` リポジトリで以下を設定します。Firebase Hosting移行後も、同じRepository variableをFirebase Hosting buildで使います。

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. `Variables`
5. `New repository variable`

追加するRepository variable:

```text
Name: VITE_GOOGLE_VISION_PROXY_URL
Value: https://cakb-google-vision-proxy-xxxxx-an.a.run.app/api/ocr
```

Cloud Run ProxyをGitHub Actionsからデプロイする場合も、active household membershipが利用許可の基準です。メール許可リストのRepository secretは不要です。

この値はAPIキーではありません。ただし、公開URLなので無制限利用を許可するものではありません。

## 8. Firebase Hostingを再デプロイする

GitHub Actionsの `Deploy Firebase Hosting` を手動実行するか、ローカルで `npm run deploy:hosting` を実行します。

完了後、caKbのレシート登録画面で「高精度OCR」が選べることを確認します。

## 9. 疎通確認する

スマホまたはPCで以下を確認します。

- レシート登録画面で「高精度OCR」が有効になっている
- 未ログイン状態では高精度OCRが使えない
- 外部OCR利用の注意文が表示される
- 画像選択後、Google Vision OCRを実行できる
- OCR確認画面に「読み取り方式: Google Vision」が表示される
- 結果を修正して保存できる
- 失敗時にローカルOCRへ戻れる

## 10. 利用量制御を確認する

- `OCR_RATE_LIMIT_MAX_REQUESTS`: 利用者1人・Cloud Runインスタンス単位の短時間上限
- `OCR_RATE_LIMIT_WINDOW_SECONDS`: 短時間上限の集計秒数
- `OCR_MONTHLY_LIMIT`: 全インスタンス共通のUTC月単位上限

月次件数はFirestoreの `ocrUsage/{YYYY-MM}` に保存します。画像、OCR全文、UID、メールアドレスは保存しません。上限到達時はHTTP 429となり、アプリからローカルOCRへ切り替えられます。

## 11. 疎通後に検討すること

- `OCR_SHARED_TOKEN` の追加防御
- 画像サイズ上限の調整
- Cloud Monitoringによるエラー率と呼び出し数の可視化
- 403や502が出た場合の運用メモ整備

## 注意

- `--allow-unauthenticated` は、ブラウザから直接呼べるようにするための設定です。アプリ層ではFirebase ID tokenを検証します。
- CORSはブラウザからの呼び出し元を制限しますが、完全な認証ではありません。未ログイン制限はFirebase ID token検証で行います。
- レシート画像はOCR処理のためにGoogle Cloud Visionへ送信されます。
- Proxyは画像やOCR全文を永続保存しません。
