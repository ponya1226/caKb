# caKb Google Services Proxy

Google Cloud Vision OCRとGoogle Sheets一方向出力をcaKbから利用するためのProxyです。Cloud Runサービス名は互換性維持のため従来名を使用します。

## 方針

- フロントエンドからGoogle Vision APIを直接呼びません。
- APIキー、service account key、token、secretはリポジトリに置きません。
- 受け取った画像とOCR全文は永続保存しません。
- 画像base64やOCR全文はログに出しません。
- CORS許可originは `CORS_ORIGINS` で制御します。
- `REQUIRE_FIREBASE_AUTH=true` ではFirebase ID tokenを検証し、未ログイン利用を拒否します。
- `REQUIRE_HOUSEHOLD_MEMBERSHIP=true` では、利用者がactive householdのmemberであることをFirestoreで確認します。
- `ALLOWED_AUTH_EMAILS` は必要な場合だけ追加のメール制限として設定できます。
- `OCR_SHARED_TOKEN` は任意の追加防御として併用できます。
- 認証済みUID単位の短時間レート制限で連続送信を抑制します。
- Firestoreの `ocrUsage/{YYYY-MM}` にプロジェクト全体の月間件数だけを保存し、月間上限を超えるVision API呼び出しを停止します。
- 利用量カウンタへ画像、OCR全文、UID、メールアドレスは保存しません。
- Google Sheets出力はactive householdのownerだけに許可し、Firestoreから1支出1行で出力します。
- Sheets APIはCloud RunのApplication Default Credentialsを使い、service account keyを保存しません。
- 支出データやスプレッドシート内容をログに出しません。

## ローカル起動

```bash
cp .env.example .env
npm install
npm run dev
```

ローカル検証では、Google Cloud SDKのApplication Default CredentialsなどでVision APIを呼び出せる状態にしてください。Cloud Runでは、実行サービスアカウントのApplication Default Credentialsを使います。

## ビルドと起動

```bash
npm install
npm run build
npm start
```

## 環境変数

- `PORT`: 待ち受けポート。Cloud Runでは自動設定されます。
- `CORS_ORIGINS`: 許可originのカンマ区切り。例: `https://cakb-dev.firebaseapp.com`
- `MAX_IMAGE_BYTES`: 受け付ける画像サイズ上限。初期値は5MBです。
- `REQUIRE_FIREBASE_AUTH`: Firebase ID token検証を必須にします。初期値は `true` です。
- `REQUIRE_HOUSEHOLD_MEMBERSHIP`: active householdのmember確認を必須にします。初期値は `true` です。
- `FIREBASE_PROJECT_ID`: Firebase ID token検証に使うproject IDです。Cloud Runで自動推定できない場合に設定します。
- `ALLOWED_AUTH_EMAILS`: 任意の追加制限です。設定時は指定メールアドレスかつhousehold memberだけが許可されます。
- `OCR_SHARED_TOKEN`: 任意。Firebase ID tokenとは別に追加する簡易トークンです。
- `OCR_RATE_LIMIT_MAX_REQUESTS`: UIDごとの短時間上限。初期値は10件、`0` で無効です。
- `OCR_RATE_LIMIT_WINDOW_SECONDS`: 短時間上限の集計秒数。初期値は60秒です。
- `OCR_MONTHLY_LIMIT`: Proxy全体のUTC月単位上限。初期値は900件、`0` で無効です。

月間上限を有効にする場合、Cloud Run実行サービスアカウントにはFirestoreのカウンタを更新するため `roles/datastore.user` が必要です。クライアントから `ocrUsage` は読み書きできません。

## エンドポイント

- `GET /health`
- `POST /api/ocr`
- `POST /api/sheets/export`

リクエスト:

```json
{
  "imageBase64": "...",
  "mimeType": "image/jpeg"
}
```

`REQUIRE_FIREBASE_AUTH=true` の場合、`Authorization: Bearer <Firebase ID token>` headerが必要です。hosted環境ではactive householdのmemberだけがOCRを利用できます。

短時間上限または月間上限に達した場合はHTTP 429を返します。フロントエンドは理由を表示し、既存のローカルOCR再試行導線を提示します。

レスポンス:

```json
{
  "provider": "googleVision",
  "text": "...",
  "blocks": []
}
```

Sheets出力リクエスト:

```json
{
  "spreadsheetId": "..."
}
```

Sheets出力はFirebase ID token、active household membership、owner roleを必須とします。出力先スプレッドシートは `cakb-vision-proxy@cakb-dev.iam.gserviceaccount.com` へ編集共有してください。`caKb支出` タブだけを全件置換し、他のタブは変更しません。

## Cloud Run

このディレクトリはDockerfileを含むため、Cloud Runへコンテナとしてデプロイできます。詳細な手順は [Google Vision Proxy Deploy](../../docs/google-vision-proxy-deploy.md) を参照してください。
