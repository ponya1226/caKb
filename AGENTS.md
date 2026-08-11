# Project Overview

caKbは、家族で利用する「家計簿をつけなくていい家計簿」PWAです。レシート画像を自前Proxy経由のGoogle Visionで読み取り、説明可能なConfidence判定がHighならFirestoreへ自動保存し、Lowまたはuncertainの場合だけ確認・修正します。通常利用にはオンライン接続、Googleログイン、active householdを必須とします。

家族共有、Firebase Auth、Firestoreクラウド正本化、Google Vision、Google Sheets一方向出力は各ADRで明示承認済みです。対象外機能を追加する場合は、ADRとユーザー承認を必須にします。

## Architecture

- Frontend: Vite, React, TypeScript
- Ledger persistence: Cloud Firestore for expenses, categories, and shop category rules
- Device-local persistence: IndexedDB only for pending reviews, legacy migration source, and test harnesses
- Settings and device-local aggregate receipt quality metrics: localStorage
- OCR: Google Vision through the self-owned proxy
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
- 自動保存可否はReactに依存しないConfidence判定へ閉じ込め、UIで独自判定しない。

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
npm run test:e2e
```

## Repository / GitHub

- GitHub repository: `https://github.com/ponya1226/caKb`
- Default remote name: `origin`
- 初回公開時はこのURLを `origin` に設定してpushする。
- push前に `git status -sb` で作業範囲を確認し、無関係な変更をstageしない。
- commit前に可能な限り `npm run lint`、`npm run test`、`npm run build`、`git diff --check` を実行する。UI変更では `npm run test:e2e` も実行する。
- commit messageは `feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:` を基本にする。
- GitHubへのpushはユーザーから明示依頼がある場合に行う。
- `main` merge後のFirebase Hostingはstaging preview、browser smoke test、GitHub production承認、検証済みversionの本番昇格の順で行う。productionを直接上書きするworkflowへ戻さない。

## Development Principles

- 最重要判断基準は、家計簿のために利用者が行う操作を減らせるかとする。
- 1タスク1目的で、無関係なリファクタリングを混ぜない。
- 既存の型、Repository、UIパターンに合わせる。
- OCR精度を断定しない。High confidenceだけを自動保存し、Lowまたはuncertainは必ず確認画面へ送る。無条件自動保存は禁止する。
- Confidenceは不透明な数値だけにせず、総額、日付、店舗、カテゴリ、競合金額、残高、品目整合性などの根拠を型で説明可能にする。
- 品目明細は付加情報とし、品目欠落だけを理由に必ず要確認へ落とさない。
- 要確認レシートはADR 0015に従い、この端末だけに最大7日一時保存する。Firestore、バックアップ、ログへ含めない。
- 自動保存品質の評価はADR 0016と0017に従い、月別・判定ルール別の件数と理由コードだけを端末内に保存する。レシート内容、金額、支出ID、利用者識別子を集計処理へ渡さず、利用者が明示的にコピーした匿名集計以外は外部へ送らない。
- 通常利用の正本はFirestoreだけとし、未認証、household未確定、オフライン時にIndexedDBへフォールバックしない。
- IndexedDBの支出・カテゴリstoreは旧データ移行元とtest harnessのために残し、新しい利用者向けローカル家計簿として使わない。
- 主要な方針変更、保存形式変更、ライブラリ追加はADRを残す。
- 大きな機能完了時は `docs/project-status.md` と `docs/development-history.md` を更新する。

## Code Style

- TypeScript strict modeを維持する。
- `any` で型問題を回避しない。
- 日付は支出日を `YYYY-MM-DD`、作成・更新日時をISO 8601 UTC文字列で保存する。
- 金額は日本円の整数として扱う。
- ユーザー向け文言は短い日本語にする。
- 利用画面では実装技術名より、利用者が行う操作と結果を優先して表現する。`OCR` と `Google Vision` は「レシート読み取り」、`Firestore` は「クラウド」、`IndexedDB` は「この端末」、`JSON` は「バックアップファイル」を基本表現とする。Tesseract.jsは通常画面に表示しない。
- Proxy、環境変数名、内部エラーコード、認証基盤の設定名は通常画面へ表示しない。エラーは利用者が次に取れる操作を案内する。
- 外部送信、データ置き換え、削除、共有範囲など、利用者の判断に必要な事実は技術用語を避けても省略しない。
- コメントは「なぜ必要か」がある箇所に絞る。
- 新規ファイルはUTF-8、インデントは2スペース。

## Testing / Verification Rules

変更後は可能な限り次を実行する。

```powershell
npm run lint
npm run test
npm run build
npm run test:e2e
```

UI変更では次を手動確認する。

- スマホ幅で主要ボタンと入力が押しやすい。
- 支出の登録、編集、削除ができる。
- High confidenceの単体レシートを確認画面なしで保存し、短時間Undoできる。
- Lowまたはuncertainの読み取り結果を理由付き確認画面で修正して保存できる。
- アカウント画面で、この端末の月別自動登録率、要確認理由、Undo率、要確認時の総額修正率を確認・コピーできる。household ownerだけが集計を消去でき、memberには管理機能を表示しない。
- 未ログイン、Firebase未設定、オフライン時に家計画面と保存操作が表示されない。
- active household接続後だけ支出の登録、編集、削除ができる。
- CSVエクスポートが実行できる。

## Security / Privacy Rules

- APIキー、token、password、secretを追加しない。
- 支出データ、レシート画像、OCR全文を未承認の外部サービスやログへ送らない。Google Vision OCRとGoogle Sheets一方向出力は各ADRの範囲だけを例外とする。
- 自動登録品質集計へ店舗名、日付、金額、品目、画像、OCR全文、支出ID、UID、メールアドレスを保存しない。
- 自動登録品質のコピー文へhousehold scopeや利用者識別子を含めず、コピーは利用者の明示操作だけで実行する。
- ADR 0015の要確認中最大7日一時保存を除き、レシート画像BlobをIndexedDBやFirestoreへ保存しない。
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

Google Vision OCR is the explicitly approved user-facing receipt OCR Provider for this project. It must be used only through a self-owned proxy such as `server/google-vision-proxy/`; the frontend must not call Google Vision directly.

Firebase Hosting, Firebase Auth, Cloud Firestore, and Google Sheets one-way export are explicitly allowed only within the scope described in `docs/decisions/0005-family-cloud-ledger-direction.md`, `docs/decisions/0006-firebase-foundation.md`, `docs/decisions/0007-firebase-hosting-auth-migration.md`, and `docs/decisions/0009-google-sheets-one-way-export.md`.

- Do not commit API keys, service account keys, tokens, passwords, or secrets.
- Do not commit `.env`; `.env.example` is allowed.
- Do not log receipt images, image base64, OCR full text, or expense data in the proxy.
- Do not persist uploaded receipt images on the proxy.
- Keep the user-facing receipt flow fixed to Google Vision. Do not reintroduce Tesseract.js, Provider selection, crop controls, or local fallback without a new ADR and explicit approval.
- External OCR use must be visible to the user before sending an image.
- External OCRの説明は維持するが、撮影ごとの不要な追加確認クリックは要求しない。
- Google Vision Proxy must verify Firebase ID tokens when `REQUIRE_FIREBASE_AUTH=true`; keep this enabled for hosted environments.
- Hosted Google Vision Proxy deployments must require active household membership with `REQUIRE_HOUSEHOLD_MEMBERSHIP=true`. `ALLOWED_AUTH_EMAILS` is an optional additional restriction only; do not hard-code real user email addresses in the repository or expose them via GitHub variables.
- Firebase client config must come from `VITE_FIREBASE_*`; do not commit real `.env` values or service account keys.
- Hosted Firebase and Cloud Run deploy workflows must use GitHub OIDC and Google Cloud Workload Identity Federation. Do not restore long-lived deploy tokens or service account JSON without a new security decision.
- Google Sheets export must require Firebase authentication, active household owner authorization, and direct editor sharing to the Cloud Run service account. Do not add bidirectional import or service account keys without a new decision.
- Adding other external services, paid APIs, bidirectional sync, or receipt-image cloud storage still requires explicit user approval and an ADR.

## Prohibited Actions

- 明示承認とADRなしに新しい有料APIや外部サービスを導入する。
- 銀行・カード連携、外部LLM、新OCR Providerなど当面対象外の機能を混ぜる。
- Confidence判定なしでOCR結果を自動保存する、またはLow/uncertainを自動保存する。
- 未認証、household未確定、オフライン時にlocal repositoryへ支出を保存するfallbackを追加する。
- ADR 0016・0017の集計を自動で外部送信する、またはレシート・支出・household・利用者を特定できる値を追加する。
- ADR 0015の期限付き要確認Inboxを除き、レシート画像Blobを保存する。
- `git reset --hard` や破壊的なcheckoutを無断で実行する。
