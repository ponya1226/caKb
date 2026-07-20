# Project Overview

ローカル家計簿PWAは、個人利用向けの無料・ローカル保存型家計簿です。レシート画像をTesseract.jsでOCRし、ユーザーが必ず確認・修正してからIndexedDBに支出を保存します。

MVPではバックエンド、ログイン、クラウド同期、家族共有、有料API、AI分析を実装しません。

次フェーズでは、明示的に承認された方針として家族共有、Firebase Auth、Firestoreクラウド正本化、Google Sheets一方向出力を実装しています。対象外機能を追加する場合は、ADRとユーザー承認を必須にします。

## Architecture

- Frontend: Vite, React, TypeScript
- Persistence: IndexedDB for expenses, categories, receipt images
- Settings: localStorage
- OCR: Tesseract.js in browser
- Charts: Recharts
- PWA: web app manifest and service worker

主要ディレクトリ:

```text
src/components/     画面とUI部品
src/constants/      初期カテゴリなどの固定値
src/hooks/          画面から使うアプリ状態の接続
src/lib/            DB、OCR、CSV、日付、候補抽出などのロジック
src/types.ts        共有型
docs/               設計、状態、ADR
public/             PWA manifest、service worker、アイコン
```

依存方向:

- UIは `hooks` と `lib` を使う。
- `lib` はReactに依存しない。
- IndexedDBの詳細は `src/lib/db.ts` に閉じ込める。
- OCR候補抽出は `src/lib/receiptParser.ts` に閉じ込め、画面に正規表現を散らさない。

## Setup Commands

```powershell
npm install
npm run dev
```

検証:

```powershell
npm run lint
npm run test
npm run build
```

## Repository / GitHub

- GitHub repository: `https://github.com/ponya1226/caKb`
- Default remote name: `origin`
- 初回公開時はこのURLを `origin` に設定してpushする。
- push前に `git status -sb` で作業範囲を確認し、無関係な変更をstageしない。
- commit前に可能な限り `npm run lint`、`npm run test`、`npm run build`、`git diff --check` を実行する。
- commit messageは `feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:` を基本にする。
- GitHubへのpushはユーザーから明示依頼がある場合に行う。

## Development Principles

- 動くMVPを優先し、クラウド同期や共有などの対象外機能を混ぜない。
- 1タスク1目的で、無関係なリファクタリングを混ぜない。
- 既存の型、Repository、UIパターンに合わせる。
- OCR精度を断定しない。保存前に必ず確認画面を挟む。
- 支出データはブラウザ内保存を前提にし、外部DBへ送らない。
- 主要な方針変更、保存形式変更、ライブラリ追加はADRを残す。
- 大きな機能完了時は `docs/project-status.md` と `docs/development-history.md` を更新する。

## Code Style

- TypeScript strict modeを維持する。
- `any` で型問題を回避しない。
- 日付は支出日を `YYYY-MM-DD`、作成・更新日時をISO 8601 UTC文字列で保存する。
- 金額は日本円の整数として扱う。
- ユーザー向け文言は短い日本語にする。
- コメントは「なぜ必要か」がある箇所に絞る。
- 新規ファイルはUTF-8、インデントは2スペース。

## Testing / Verification Rules

変更後は可能な限り次を実行する。

```powershell
npm run lint
npm run test
npm run build
```

UI変更では次を手動確認する。

- スマホ幅で主要ボタンと入力が押しやすい。
- 支出の登録、編集、削除ができる。
- OCR結果を確認画面で修正して保存できる。
- 再読み込み後もIndexedDBのデータが残る。
- CSVエクスポートが実行できる。

## Security / Privacy Rules

- APIキー、token、password、secretを追加しない。
- 支出データ、レシート画像、OCR全文を未承認の外部サービスやログへ送らない。Google Vision OCRとGoogle Sheets一方向出力は各ADRの範囲だけを例外とする。
- レシート画像保存OFFでは画像BlobをIndexedDBへ保存しない。
- データ初期化は確認ダイアログを挟む。
- ユーザーが作成した既存変更を無断で削除、revertしない。

## ADR Rules

次の変更は `docs/decisions/` にADRを追加または更新する。

- 保存形式、IndexedDB schema、migration方針の変更
- OCRエンジン、チャート、PWA基盤など主要ライブラリの変更
- 外部サービス、バックエンド、同期機能の追加
- 対象ユーザーやMVP範囲の変更

軽微な文言修正、局所的なbug fix、テスト追加だけならADRは不要です。

## Google Vision OCR Exception

Google Vision OCR is an explicitly allowed optional external OCR Provider for this project. It must be used only through a self-owned proxy such as `server/google-vision-proxy/`; the frontend must not call Google Vision directly.

Firebase Hosting, Firebase Auth, Cloud Firestore, and Google Sheets one-way export are explicitly allowed only within the scope described in `docs/decisions/0005-family-cloud-ledger-direction.md`, `docs/decisions/0006-firebase-foundation.md`, `docs/decisions/0007-firebase-hosting-auth-migration.md`, and `docs/decisions/0009-google-sheets-one-way-export.md`.

- Do not commit API keys, service account keys, tokens, passwords, or secrets.
- Do not commit `.env`; `.env.example` is allowed.
- Do not log receipt images, image base64, OCR full text, or expense data in the proxy.
- Do not persist uploaded receipt images on the proxy.
- Keep Tesseract.js available as `localTesseract` fallback.
- External OCR use must be visible to the user before sending an image.
- Google Vision Proxy must verify Firebase ID tokens when `REQUIRE_FIREBASE_AUTH=true`; keep this enabled for hosted environments.
- Hosted Google Vision Proxy deployments must require active household membership with `REQUIRE_HOUSEHOLD_MEMBERSHIP=true`. `ALLOWED_AUTH_EMAILS` is an optional additional restriction only; do not hard-code real user email addresses in the repository or expose them via GitHub variables.
- Firebase client config must come from `VITE_FIREBASE_*`; do not commit real `.env` values or service account keys.
- Firebase Hosting deploy credentials must stay in GitHub Secrets or local Firebase CLI auth; do not commit deploy tokens or service account JSON.
- Google Sheets export must require Firebase authentication, active household owner authorization, and direct editor sharing to the Cloud Run service account. Do not add bidirectional import or service account keys without a new decision.
- Adding other external services, paid APIs, bidirectional sync, or receipt-image cloud storage still requires explicit user approval and an ADR.

## Prohibited Actions

- 有料APIを導入する。
- バックエンド、ログイン、クラウド同期、家族共有をMVPへ混ぜる。
- OCR結果を確認なしで自動保存する。
- レシート画像保存OFFでも画像Blobを保存する。
- `git reset --hard` や破壊的なcheckoutを無断で実行する。
