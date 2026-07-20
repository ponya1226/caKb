# Google Sheets一方向出力セットアップ

## 構成

Firebase Hostingの設定画面から、認証済みCloud Run Proxyへ出力を依頼します。Proxyはactive householdのownerを確認し、Firestoreの支出をGoogle Sheetsの `caKb支出` タブへ1支出1行で出力します。

Sheets側の変更はcaKbへ戻りません。再出力時は `caKb支出` タブだけを全件置換します。

## Google Cloud設定

プロジェクトでGoogle Sheets APIを有効化します。

```bash
gcloud services enable sheets.googleapis.com --project=cakb-dev
```

Cloud Runは既存の実行サービスアカウントをApplication Default Credentialsとして使用します。service account keyは作成しません。

## 利用者の設定

1. 出力先にするGoogleスプレッドシートを作成または開く。
2. 共有画面で次のサービスアカウントを編集者として追加する。

```text
cakb-vision-proxy@cakb-dev.iam.gserviceaccount.com
```

3. 通知は不要にする。サービスアカウントはメールを受信しない。
4. caKbの設定画面でスプレッドシートURLまたはIDを入力する。
5. `支出をSheetsへ出力` を実行する。

成功すると `caKb支出` タブが作成され、最終出力日時と件数が設定画面へ表示されます。

## フロントエンド設定

Sheets専用URLを省略した場合は、`VITE_GOOGLE_VISION_PROXY_URL` の `/api/ocr` を `/api/sheets/export` に置き換えたURLを使用します。別URLを使う場合だけ次を設定します。

```env
VITE_GOOGLE_SHEETS_PROXY_URL=https://YOUR_CLOUD_RUN_URL/api/sheets/export
```

URLは秘密情報ではありません。Google Cloud認証情報やservice account keyをフロントエンドへ設定しないでください。

## エラー確認

- 管理者だけが実行できます: active householdのownerでログインしているか確認する。
- スプレッドシートを開けません: URL/IDとサービスアカウントの編集権限を確認する。
- Sheets API設定エラー: `sheets.googleapis.com` が有効か確認する。
- 再ログイン案内: Firebase Authへ再ログインしてから実行する。

Proxyは支出データ、スプレッドシート内容、APIエラー詳細をログへ出力しません。
