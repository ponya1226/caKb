# caKb Google Vision OCR Proxy

Google Cloud Vision OCRをcaKbから利用するためのサンプルProxyです。

## 方針

- フロントエンドからGoogle Vision APIを直接呼びません。
- APIキー、service account key、token、secretはリポジトリに置きません。
- 受け取った画像とOCR全文は永続保存しません。
- 画像base64やOCR全文はログに出しません。
- CORS許可originは `CORS_ORIGINS` で制御します。
- `REQUIRE_FIREBASE_AUTH=true` ではFirebase ID tokenを検証し、未ログイン利用を拒否します。
- `OCR_SHARED_TOKEN` は任意の追加防御として併用できます。

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
- `FIREBASE_PROJECT_ID`: Firebase ID token検証に使うproject IDです。Cloud Runで自動推定できない場合に設定します。
- `OCR_SHARED_TOKEN`: 任意。Firebase ID tokenとは別に追加する簡易トークンです。

## エンドポイント

- `GET /health`
- `POST /api/ocr`

リクエスト:

```json
{
  "imageBase64": "...",
  "mimeType": "image/jpeg"
}
```

`REQUIRE_FIREBASE_AUTH=true` の場合、`Authorization: Bearer <Firebase ID token>` headerが必要です。

レスポンス:

```json
{
  "provider": "googleVision",
  "text": "...",
  "blocks": []
}
```

## Cloud Run

このディレクトリはDockerfileを含むため、Cloud Runへコンテナとしてデプロイできます。詳細な手順は [Google Vision Proxy Deploy](../../docs/google-vision-proxy-deploy.md) を参照してください。
