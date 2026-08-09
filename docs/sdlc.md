# SDLC

caKbは、短期ブランチ、Pull Request、必須CI、`main` へのmerge、staging配布、browser smoke test、production承認、本番昇格の順で変更をリリースします。

## 開発フロー

1. 最新の `main` から `codex/<task-name>` 形式の短期ブランチを作成する。
2. 1つの目的に限定して実装し、必要なテストとドキュメントを更新する。
3. ローカル検証後にcommit、pushし、Pull Requestを作成する。
4. 必須CIがすべて成功してから `main` へmergeする。
5. Firebase Hostingの `staging` preview channelへの配布とbrowser smoke test成功を確認する。
6. GitHub Actionsの `production` environmentで配布を承認する。
7. Firestore Rulesと、stagingで検証したHosting versionの本番昇格を確認する。
8. Cloud Run変更がある場合は、そのdeployとProxy health endpointのsmoke testも確認する。

`main` への直接push、force push、履歴削除は行いません。緊急修正でも短期ブランチとPull Requestを使用します。

## 必須CI

- `Frontend CI`: 型検査、ユニットテスト、production build、production依存監査
- `Browser Smoke CI`: Chromiumのスマホ設定でアカウント、レシート、IndexedDB支出CRUD、匿名fixtureのOCR確認、横overflowを検証
- `Firestore Rules CI`: Firebase Emulatorを使ったSecurity Rulesテスト
- `Proxy CI`: Proxyのユニットテスト、TypeScript build、production依存監査
- `Dependency Review`: Pull Requestで追加される重大度high以上の既知脆弱性を拒否

GitHub Actionsはcommit SHAで固定します。Dependabotでnpm、GitHub Actions、Docker base imageの更新Pull Requestを週次作成します。npmとDockerの自動Pull Requestはminor/patchに限定し、major updateは影響範囲を確認する個別タスクとして扱います。

## セキュリティ

- credential、token、実レシート、OCR全文、家計簿データをissue、Pull Request、CI logへ載せない。
- 脆弱性は `SECURITY.md` に従って非公開報告する。
- secret scanning、push protection、Dependabot security updatesを有効にする。
- stagingとproduction deployはGitHub OIDCとWorkload Identity Federationで短時間認証し、FirebaseとCloud Runでdeploy用service accountを分離する。
- GitHubの `production` environmentは管理者のrequired reviewer承認を必須にし、protected branch以外からのdeployを許可しない。
- staging smoke testへ実アカウント、実レシート、家計簿データを持ち込まない。stagingはHostingだけのpreviewであり、Firebase backendの分離環境として扱わない。
- WIF provider conditionでrepository ID、owner ID、`main` branchを固定し、service accountのIAM bindingを `workflow_ref` で限定する。
- Cloud Run source buildは専用service accountを明示し、deploy、build、runtimeのidentityを分離する。
- Google Cloud IAMは `docs/gcp-iam-baseline.md` を基準に定期監査し、既定Compute service accountへOwnerまたはEditorを付与しない。
- Proxyの間接依存に残るmoderate advisoryは、上流の安全な更新を監視する。破壊的な旧版への強制変更は行わない。

## リリース確認

merge後は次を確認します。

- `Deploy Firebase Hosting` のstaging jobとbrowser smoke testが成功している。
- production承認後、同workflowのproduction jobが成功している。
- Proxyまたはそのworkflowを変更した場合、`Deploy Google Vision Proxy` が成功している。
- `https://cakb-dev.firebaseapp.com/` が表示できる。
- Cloud Runの `/health` が成功する。
- 認証、家計簿表示、支出登録に影響する変更では、スマホを含む主要動線を確認する。

## ロールバック

1. 影響範囲をHosting、Firestore Rules、Cloud Run、保存データに分けて確認する。
2. 問題を導入したPull RequestをrevertするPull Requestを作成する。
3. 必須CIを通し、merge後のstaging smoke test、production承認、本番昇格を確認する。
4. Cloud Runだけの障害で即時復旧が必要な場合は、直前の正常revisionへtrafficを戻し、その後revert Pull Requestで正本を合わせる。
5. 保存形式やRulesの後方互換性に影響する場合は、自動デプロイせずmigrationと復旧手順を先に確定する。

## 次の改善

1. TypeScript型検査とは別にESLint、formatter、coverage基準を導入する。
2. 主要画面と巨大モジュールを責務単位に分割する。
3. 認証済み家族共有を自動検証する必要が生じた場合は、独立したFirebase staging projectを検討する。
