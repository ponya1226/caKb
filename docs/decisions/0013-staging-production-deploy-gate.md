# ADR 0013: Firebase Hosting staging channelとproduction承認ゲート

## Status

Accepted

## Context

caKbはPull Requestの必須CIを通した後、`main` へのmergeを契機にFirebase HostingとFirestore Rulesを直接productionへ配布していた。production build自体はCIで検証できるが、Firebase Hostingから実際に配信されたファイル、PWA設定、遅延読み込みをproduction反映前にブラウザで確認する段階がなかった。

利用中の家計簿であるため、merge直後に配信不備がそのまま利用者へ届く構成を避ける必要がある。一方、現段階でFirebaseプロジェクトを追加し、Authentication、Firestore、Cloud Run、課金管理を二重に運用するコストは大きい。

## Decision

- `main` へのpush後、Firebase Hostingの固定preview channel `staging` へproduction buildを配布する。
- preview channelの有効期限は30日とし、各deployで更新する。
- staging URLに対し、Playwrightの未ログイン・IndexedDB動線のbrowser smoke testを実行する。
- staging検証が成功した後、GitHubの `production` environmentでrequired reviewerの承認を待つ。
- 承認後にFirestore Rulesを配布し、検証済みの `staging` Hosting versionを `live` channelへcloneする。production向けに別buildは行わない。
- GitHub Actionsの認証は既存のOIDCとWorkload Identity Federationを継続し、service account keyやdeploy tokenを追加しない。
- `staging` と `production` のGitHub environmentsはprotected branchだけを許可する。`production` だけにrequired reviewerを設定する。
- Firestore RulesにはHosting preview channel相当の分離機能がないため、stagingでは配布せず、production承認後にだけ配布する。
- 保存形式またはRulesの後方互換性を失う変更は、この自動昇格を前提にせず、先にmigrationとrollback手順を決定する。

## Security And Privacy

- staging smoke testでは実Googleアカウント、実レシート、外部OCR、Firestoreのproductionデータを使用しない。
- stagingは同じFirebaseプロジェクト上のHosting previewであり、独立したbackend環境ではない。実利用者による認証済み検証には使わない。
- CI logとartifactへcredential、レシート画像、OCR全文、支出データを出力しない。
- production jobはGitHub environmentの承認前に開始せず、承認前はOIDC tokenも取得しない。

## Consequences

- production反映前に、Firebase Hostingが実際に配信するURLで主要画面と端末内CRUDを確認できる。
- stagingで通ったHosting versionとproductionへ反映するversionが一致する。
- mergeからproduction反映までにbrowser test時間と管理者承認が必要になる。
- Firestore、Authentication、Cloud Runはproductionと分離されない。認証済み家族共有の自動統合テストには別Firebaseプロジェクトが必要になる。
- Firestore RulesとHostingの昇格は完全な同時処理ではないため、Rules変更は原則として直前versionと後方互換にする。

## Alternatives Considered

- `main` からproductionへ直接deployを継続する: 運用は簡単だが、配信物の不具合をproduction反映前に検出できない。
- staging用Firebaseプロジェクトを新設する: backendまで分離できるが、Auth、Firestore、Cloud Run、Secrets、予算監視の二重管理が必要になるため今回は採用しない。
- staging成功後にproductionを再buildする: 実行は単純だが、確認した配信物とproduction配信物が異なる可能性があるため採用しない。
- productionを毎回ローカルから手動deployする: 承認履歴と再現性が弱く、長期credential運用につながるため採用しない。

## Rollback

- 問題を導入した変更はrevert Pull Requestを作り、同じstaging検証とproduction承認を経て配布する。
- 即時復旧が必要なHosting障害では、Firebase Hostingの直前の正常versionをliveへcloneし、その後revert Pull RequestでGit正本を合わせる。
- Firestore Rulesを戻す必要がある場合は、保存済みデータとの互換性を確認したRulesだけを配布する。

## Follow-up

- 実Googleログイン、owner/member共有、Firestore接続を自動検証する必要が生じた場合は、独立したFirebase staging projectを別ADRで検討する。
- production承認の待ち時間と失敗率を確認し、必要なら承認者追加と緊急rollback手順を調整する。
