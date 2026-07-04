# caKb Google Vision OCR Proxy

Google Cloud Vision OCRをcaKbから利用するためのサンプルProxyです。

## 方針

- フロントエンドからGoogle Vision APIを直接呼びません。
- APIキー、service account key、token、secretはリポジトリに置きません。
- 受け取った画像とOCR全文は永続保存しません。
- 画像base64やOCR全文はログに出しません。
- CORS許可originは `CORS_ORIGINS` で制御します。

## セットアップ

```bash
cp .env.example .env
npm install
npm run dev
```

Google Cloud上では、Cloud Runなどの実行環境に付与したサービスアカウントでVision APIを呼び出す想定です。ローカル検証では `GOOGLE_APPLICATION_CREDENTIALS` など、Google Cloud SDK標準の認証方式を使ってください。

## 環境変数

- `PORT`: 待ち受けポート
- `CORS_ORIGINS`: 許可originのカンマ区切り
- `MAX_IMAGE_BYTES`: 受け付ける画像サイズ上限
- `OCR_SHARED_TOKEN`: 任意。設定した場合、クライアントは `X-caKb-OCR-Token` を送信する必要があります

## エンドポイント

- `GET /health`
- `POST /api/ocr`

```json
{
  "imageBase64": "...",
  "mimeType": "image/jpeg"
}
```

レスポンス:

```json
{
  "provider": "googleVision",
  "text": "...",
  "blocks": []
}
```
