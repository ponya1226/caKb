# ADR 0010: GitHub Actionsのデプロイ認証をWorkload Identity Federationへ移行する

- Status: Accepted
- Date: 2026-08-09

## Context

Firebase Hosting、Firestore Rules、Cloud Runのデプロイは、GitHub Secretに保存した1つのservice account JSONを共有していた。このservice accountはFirebase、Cloud Run、Cloud Build、Cloud Storageの広い権限を持ち、ユーザー管理鍵は明示的に失効させるまで有効である。

Pull Request必須化とCI強化後も、長期鍵の漏えい範囲と用途間の権限共有がproduction deployの主要な残存リスクだった。

## Decision

- GitHub ActionsからGoogle Cloudへの認証は、GitHub OIDCとGoogle Cloud Workload Identity Federationを使用する。
- service account JSON、access token、deploy tokenはGitHub Actionsに保存しない。
- Firebase HostingとFirestore Rulesは `github-firebase-hosting-deploy`、Cloud Runは `github-cloud-run-deploy` を使用する。
- Cloud Run source buildは `cakb-cloud-run-builder` を明示指定し、`roles/run.builder` だけを付与する。Editor権限を持つ既定Compute service accountは使用しない。
- GitHub用WIF pool/providerは1組にし、provider conditionでGitHub repository ID、owner ID、`main` branchを固定する。
- service accountのIAM bindingを `workflow_ref` で限定し、各workflowは対応するservice accountだけをimpersonateできるようにする。
- Cloud Run deployでは既存のpublic invoker policyを変更せず、revision更新だけを行う。
- WIFで両デプロイの成功を確認後、旧GitHub Secret、ユーザー管理service account key、旧service accountのCloud Run、Cloud Build、Cloud Storage権限を削除する。

## Alternatives

- GitHub SecretのJSON鍵をローテーションして継続利用する: 移行は小さいが、長期credentialと広い権限共有が残るため不採用。
- 1つのservice accountを全デプロイで共有する: 鍵は廃止できるが、workflow間の権限分離が弱いため不採用。
- デプロイをすべて手動化する: credential管理は単純になるが、再現性とリリース確認が低下するため不採用。

## Consequences

- GitHub Actionsは実行時だけ短時間のGoogle Cloud credentialを取得する。
- WIF provider、service account、IAM bindingのGoogle Cloud側運用が必要になる。
- workflow名や配置を変更する場合はservice accountのIAM bindingを更新し、default branchやrepository ownerを変更する場合はprovider conditionも更新する必要がある。
- Firebase HostingとFirestore Rulesは同一workflow内で同時に配布する。さらに厳密な分離が必要になった場合はworkflowとservice accountを分割する。
- 保存データ、Firestore schema、Security Rulesの内容、Cloud Run runtime service accountは変更しない。
- Cloud Run deployer、build service account、runtime service accountを分離し、各役割の `actAs` は必要な組み合わせだけに限定する。

## Security / Privacy

- provider conditionは変更可能なrepository名だけでなく、immutableなrepository IDとowner IDを検証する。
- GitHub workflowには `id-token: write` と `contents: read` だけを付与する。
- `gha-creds-*.json` は一時ファイルとして扱い、GitとDocker build contextから除外する。
- WIF移行後に長期鍵を復旧手段として残さない。緊急時は所有者による手動deployまたは直前revisionへのrollbackを使用する。
- レシート画像、OCR全文、家計簿データの処理・保存方式は変更しない。

## Verification

- Pull Request CIがすべて成功する。
- `main` merge後にFirebase Hosting、Firestore Rules、Cloud RunをWIFでdeployできる。
- Firebase Hostingの公開URLとCloud Runの `/health` が成功する。
- Cloud Runの未認証OCRリクエストが引き続き拒否される。
- GitHub Secretとユーザー管理service account keyを削除した後もworkflowを手動再実行できる。
