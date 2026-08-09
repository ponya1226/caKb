# Contributing

開発環境はNode.js 24とnpm 11に統一します。ルートの `.node-version` を参照してください。

## 作業前

1. `git status --short` で既存変更を確認する。
2. `main` から `codex/<task-name>` などの短期ブランチを作成する。
3. 対象ファイルと関連する `docs/` を読む。
4. 保存形式、主要依存、MVP範囲に影響する場合はADR要否を判断する。

## 実装方針

- 画面はスマホ操作を最優先にする。
- UIからIndexedDBを直接触らず、`src/lib/db.ts` と `src/hooks/useBudgetData.ts` 経由にする。
- OCR候補抽出の調整は `src/lib/receiptParser.ts` とテストを同時に更新する。
- 新しい依存は、標準APIや既存依存で解けない場合だけ追加する。

## 検証

```powershell
npm run lint
npm run test
npm run build
```

UIまたは主要動線を変更した場合は、Playwright用Chromiumを初回だけ導入し、browser smoke testも実行する。

```powershell
npx playwright install chromium
npm run test:e2e
```

実行できない検証がある場合は、理由と残るリスクを記録する。

ProxyまたはFirestore Rulesを変更した場合は、追加で次を実行する。

```powershell
npm --prefix server/google-vision-proxy run test
npm --prefix server/google-vision-proxy run build
npm run test:rules
git diff --check
```

## Pull Request

- `main` へ直接pushせず、短期ブランチからPull Requestを作成する。
- `Frontend CI`、`Browser Smoke CI`、`Firestore Rules CI`、`Proxy CI`、`Dependency Review`を通してからmergeする。
- 1つのPull Requestには1つの目的だけを含める。
- データ形式、Security Rules、Proxy APIを変える場合は、後方互換性とrollback方法を記載する。
- merge後にFirebase Hostingのstaging smoke testを確認し、production environmentを承認して本番昇格まで確認する。Cloud Run変更時はCloud Run workflowも確認する。
- 詳細な開発・リリース手順は `docs/sdlc.md` を参照する。

## Commit

commit messageは次を基本にする。

- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`
- `chore:`
