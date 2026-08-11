# caKb 家族の家計簿

caKbは「家計簿をつけなくていい家計簿」を目指す家計簿PWAです。レシートを撮影すると、日付、店舗、総額、カテゴリを説明可能なルールで判定し、確信度が高い場合は自動保存します。判断が曖昧な場合だけ確認画面へ案内します。未ログイン時はIndexedDB、ログイン済みでクラウド家計簿へ参加している場合はFirestoreを支出データの正本として利用します。

## 主な機能

- 支出の手入力登録、編集、削除
- レシート画像アップロードまたはカメラ撮影
- Google Visionによるレシート文字読み取り
- 読み取り結果からの日付、店舗名、金額候補抽出
- Confidence判定による単体レシートの自動保存
- 自動保存直後の「元に戻す」
- 判断が曖昧なレシートだけを確認・修正して保存
- 要確認レシートの端末内一時Inboxとホームの件数表示
- 店舗名・金額・画像を記録しない端末内の自動登録品質集計
- 店舗別カテゴリルールによるカテゴリ初期値反映
- 利用者によるカテゴリ追加、名称変更、色変更
- IndexedDBへの支出、カテゴリ、任意のレシート画像保存
- ダッシュボードの月次合計、前月比、カテゴリ別支出、日別推移
- 年間支出画面の年合計、月別支出、カテゴリ別年間支出
- CSVエクスポート
- FirestoreからGoogle Sheetsへの管理者向け一方向出力
- PWA manifestとservice worker

## セットアップ

Node.js 24とnpm 11を前提にしています。ルートの `.node-version` と同じバージョンを使用してください。

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
npx playwright install chromium
npm run lint:e2e
npm run test:e2e
```

`npm run test:e2e` はproduction buildを起動し、スマホ幅のChromiumでアカウント、レシート、支出の登録・編集・削除を確認します。匿名fixtureでHigh confidenceの自動保存とUndo、Low confidenceの確認フォールバック、要確認Inbox、自動登録品質集計の再読み込み・household分離・消去を検証します。Chromiumのインストールは開発端末ごとに初回だけ必要です。

## データ保存

- ローカル利用時の支出、カテゴリ、レシート画像はブラウザ内のIndexedDBに保存します。
- クラウド家計簿利用時の支出、カテゴリ、店舗別カテゴリルールはFirestoreへ保存します。レシート画像BlobはFirestoreへ保存しません。
- 設定はlocalStorageに保存します。
- 店舗別カテゴリルールもlocalStorageに保存し、JSONバックアップ/復元の対象に含めます。
- レシート画像保存は設定画面でON/OFFできます。初期値はOFFです。
- 要確認レシートの画像と読み取った文字は、確認できるよう撮影した端末に最大7日間だけ一時保存します。確定後の画像保存がOFFでも要確認中は保持し、保存・破棄・期限切れで削除します。
- 要確認Inboxはクラウド、バックアップファイル、CSV、Google Sheetsには含めません。
- 自動登録率、要確認理由、Undo率、要確認時の総額修正率は、レシート内容を含まない月別件数としてこの端末に最大12か月保存します。外部サービスや家族の別端末へ送信しません。
- レシート読み取りでは、利用者への明示後に画像を自前Proxy経由でGoogle Visionへ送信します。caKbのサーバーには画像を保存しません。

## 開発ドキュメント

- `AGENTS.md`: 開発ルールと完了条件
- `CONTRIBUTING.md`: 作業手順と検証
- `SECURITY.md`: 脆弱性の非公開報告方法
- `docs/architecture.md`: 構成と依存方向
- `docs/sdlc.md`: ブランチ、CI、リリース、ロールバック手順
- `docs/development-roadmap.md`: 今後の開発方針
- `docs/project-status.md`: 実装状況
- `docs/development-history.md`: 作業履歴
- `docs/decisions/`: ADR

## レシート読み取り

利用者向けのレシート読み取りはGoogle Visionに固定しています。単体レシートは撮影後に自動で読み取り、安全に判断できた場合は確認操作なしで保存します。判断できない場合だけ既存確認画面を表示します。フロントエンドからGoogle Cloudへ直接接続せず、自前Proxyを経由します。Proxy URLが未設定の場合、レシート読み取りは無効になり、手入力は引き続き利用できます。

自動保存と要確認の方針は `docs/decisions/0014-capture-first-auto-save-direction.md`、端末内一時Inboxは `docs/decisions/0015-device-local-pending-receipt-inbox.md`、個人情報を持たない品質集計は `docs/decisions/0016-device-local-receipt-quality-metrics.md` を参照してください。

```env
VITE_GOOGLE_VISION_PROXY_URL=
```

Proxyサンプルは `server/google-vision-proxy/` にあります。Google Cloud認証情報、APIキー、token、secretはリポジトリへ追加しないでください。Google Vision利用時は、レシート画像がOCR処理のために外部サービスへ送信されます。

Cloud Runへの疎通確認手順は `docs/google-vision-proxy-deploy.md` を参照してください。Firebase Hosting / GitHub Actionsでは `VITE_GOOGLE_VISION_PROXY_URL` をRepository variableとして設定し、ビルド時に埋め込みます。Google Vision ProxyはFirebase ID tokenとactive household membershipを確認します。正規公開URLはFirebase Hostingのみです。

Google Vision ProxyはFirebase ID tokenとhousehold membershipを検証するため、レシート読み取りは家計簿へ参加済みのGoogleログイン利用者が利用します。未ログイン時や通信障害時は手入力を利用します。Tesseract.jsと端末内読み取りは採用していません。

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

Firebase Hostingへのdeployは、`main` へmergeすると `Deploy Firebase Hosting` workflowがstaging previewへ配布し、公開URL上でbrowser smoke testを実行します。成功後はGitHubのproduction承認を待ち、承認された同じHosting versionを本番へ昇格します。GitHub OIDCとGoogle Cloud Workload Identity Federationで短時間認証するため、service account JSONやdeploy tokenはGitHubへ登録しません。構成は `docs/decisions/0010-github-actions-wif-deploy-auth.md` と `docs/decisions/0013-staging-production-deploy-gate.md` を参照してください。
