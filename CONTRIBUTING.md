# Contributing

## 作業前

1. `git status --short` で既存変更を確認する。
2. 対象ファイルと関連する `docs/` を読む。
3. 保存形式、主要依存、MVP範囲に影響する場合はADR要否を判断する。

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

実行できない検証がある場合は、理由と残るリスクを記録する。

## Commit

commit messageは次を基本にする。

- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`
- `chore:`
