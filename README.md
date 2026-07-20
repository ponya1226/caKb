# ローカル家計簿PWA MVP

レシート画像を撮影またはアップロードし、OCR結果を確認・修正して支出を記録する家計簿PWAです。未ログイン時はIndexedDB、ログイン済みでクラウド家計簿へ参加している場合はFirestoreを支出データの正本として利用します。

## 主な機能

- 支出の手入力登録、編集、削除
- レシート画像アップロードまたはカメラ撮影
- Tesseract.jsによるOCRテキスト抽出
- OCR結果からの日付、店舗名、金額候補抽出
- OCR確認画面での修正後保存
- 店舗別カテゴリルールによるカテゴリ初期値反映
- 利用者によるカテゴリ追加、名称変更、色変更
- IndexedDBへの支出、カテゴリ、任意のレシート画像保存
- ダッシュボードの月次合計、前月比、カテゴリ別支出、日別推移
- 年間支出画面の年合計、月別支出、カテゴリ別年間支出
- CSVエクスポート
- FirestoreからGoogle Sheetsへの管理者向け一方向出力
- PWA manifestとservice worker

## セットアップ

Node.js 20以上を前提にしています。

```powershell
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

## 確認コマンド

```powershell
npm run lint
npm run test
npm run build
```

## データ保存

- ローカル利用時の支出、カテゴリ、レシート画像はブラウザ内のIndexedDBに保存します。
- クラウド家計簿利用時の支出、カテゴリ、店舗別カテゴリルールはFirestoreへ保存します。レシート画像BlobはFirestoreへ保存しません。
- 設定はlocalStorageに保存します。
- 店舗別カテゴリルールもlocalStorageに保存し、JSONバックアップ/復元の対象に含めます。
- レシート画像保存は設定画面でON/OFFできます。初期値はOFFです。
- OCRは有料APIや外部DBを使いません。Tesseract.jsの言語データ取得はライブラリの標準挙動に従います。

## 開発ドキュメント

- `AGENTS.md`: 開発ルールと完了条件
- `CONTRIBUTING.md`: 作業手順と検証
- `docs/architecture.md`: 構成と依存方向
- `docs/development-roadmap.md`: 今後の開発方針
- `docs/project-status.md`: 実装状況
- `docs/development-history.md`: 作業履歴
- `docs/decisions/`: ADR

## Google Vision OCR任意利用

標準では従来どおりローカルOCRを利用できます。Google Vision OCRを使う場合は、フロントエンドからGoogle Cloudへ直接接続せず、自前Proxyを経由します。

```env
VITE_GOOGLE_VISION_PROXY_URL=
```

Proxyサンプルは `server/google-vision-proxy/` にあります。Google Cloud認証情報、APIキー、token、secretはリポジトリへ追加しないでください。Google Vision利用時は、レシート画像がOCR処理のために外部サービスへ送信されます。

Cloud Runへの疎通確認手順は `docs/google-vision-proxy-deploy.md` を参照してください。Firebase Hosting / GitHub Actionsでは `VITE_GOOGLE_VISION_PROXY_URL` をRepository variableとして設定し、ビルド時に埋め込みます。Google Vision ProxyはFirebase ID tokenとactive household membershipを確認します。

Google Vision ProxyはFirebase ID tokenとhousehold membershipを検証するため、高精度OCRは家計簿へ参加済みのGoogleログイン利用者が利用します。未ログイン時は従来どおりローカルOCRを利用できます。

## Google Sheets一方向出力

クラウド家計簿の管理者は、Firestoreの支出を指定したGoogleスプレッドシートの `caKb支出` タブへ1支出1行で出力できます。Sheets側の編集内容はcaKbへ取り込みません。

サービスアカウント鍵は使用せず、Cloud Runの実行サービスアカウントを対象スプレッドシートへ編集者として共有します。設定手順は `docs/google-sheets-sync-setup.md`、決定内容は `docs/decisions/0009-google-sheets-one-way-export.md` を参照してください。

## Firebase Hosting / Auth / Firestore次フェーズ準備

Firebase Auth / Firestoreを家族共有のクラウド正本として利用します。設定がない場合、アプリは従来どおりIndexedDB正本で動作します。

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

詳細は `docs/firebase-cloud-setup.md` と `docs/decisions/0006-firebase-foundation.md` を参照してください。Firebase設定値やservice account keyはリポジトリへ追加しないでください。

Firebase設定後は、設定画面のアカウント欄からGoogleログインできます。ログイン後はクラウド家計簿を作成し、IndexedDB内の支出、カテゴリ、店舗別カテゴリルールをFirestoreへ手動コピーできます。クラウド家計簿へ接続後はFirestoreを支出登録・一覧表示の正本として使います。

スマホのGoogleログイン安定化のため、正規の確認URLは Firebase Hosting の `https://cakb-dev.firebaseapp.com` です。Hosting移行の方針は `docs/decisions/0007-firebase-hosting-auth-migration.md` を参照してください。

Firebase Hostingへのdeployは、GitHub Secret `FIREBASE_SERVICE_ACCOUNT_CAKB_DEV` を設定したうえで `main` へpushすると `Deploy Firebase Hosting` workflowが自動実行されます。手動実行も可能です。secretやservice account keyはrepoへコミットしません。
