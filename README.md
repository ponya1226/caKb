# ローカル家計簿PWA MVP

レシート画像を撮影またはアップロードし、Tesseract.js OCRの結果を確認・修正して支出を記録する、無料・ローカル保存型の家計簿アプリです。バックエンド、ログイン、クラウド同期、家族共有はMVP対象外です。

## 主な機能

- 支出の手入力登録、編集、削除
- レシート画像アップロードまたはカメラ撮影
- Tesseract.jsによるOCRテキスト抽出
- OCR結果からの日付、店舗名、金額候補抽出
- OCR確認画面での修正後保存
- IndexedDBへの支出、カテゴリ、任意のレシート画像保存
- ダッシュボードの月次合計、前月比、カテゴリ別支出、日別推移
- CSVエクスポート
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

- 支出、カテゴリ、レシート画像はブラウザ内のIndexedDBに保存します。
- 設定はlocalStorageに保存します。
- レシート画像保存は設定画面でON/OFFできます。初期値はOFFです。
- OCRは有料APIや外部DBを使いません。Tesseract.jsの言語データ取得はライブラリの標準挙動に従います。

## 開発ドキュメント

- `AGENTS.md`: 開発ルールと完了条件
- `CONTRIBUTING.md`: 作業手順と検証
- `docs/architecture.md`: 構成と依存方向
- `docs/project-status.md`: 実装状況
- `docs/development-history.md`: 作業履歴
- `docs/decisions/`: ADR

## Google Vision OCR任意利用

標準では従来どおりローカルOCRを利用できます。Google Vision OCRを使う場合は、フロントエンドからGoogle Cloudへ直接接続せず、自前Proxyを経由します。

```env
VITE_GOOGLE_VISION_PROXY_URL=
```

Proxyサンプルは `server/google-vision-proxy/` にあります。Google Cloud認証情報、APIキー、token、secretはリポジトリへ追加しないでください。Google Vision利用時は、レシート画像がOCR処理のために外部サービスへ送信されます。

Cloud Runへの疎通確認手順は `docs/google-vision-proxy-deploy.md` を参照してください。GitHub Pagesでは `VITE_GOOGLE_VISION_PROXY_URL` をRepository variableとして設定し、ビルド時に埋め込みます。
