# Google Cloud IAM Baseline

caKbのGoogle Cloud権限は、deploy、build、runtimeの用途ごとにservice accountを分離します。既定Compute service accountは使用せず、プロジェクトロールを付与しません。

## 許可する権限

| service account | 用途 | プロジェクトロール |
| --- | --- | --- |
| `github-firebase-hosting-deploy` | Firebase Hosting / Firestore Rules deploy | `roles/firebasehosting.admin`, `roles/firebaserules.admin` |
| `github-cloud-run-deploy` | Cloud Run source deploy | `roles/run.sourceDeveloper`, `roles/serviceusage.serviceUsageConsumer` |
| `cakb-cloud-run-builder` | Cloud Run source build | `roles/run.builder` |
| `cakb-vision-proxy` | Vision Proxy runtime | `roles/datastore.user`, `roles/datastore.viewer` |

Cloud Run deploy accountの `roles/iam.serviceAccountUser` は、`cakb-cloud-run-builder` と `cakb-vision-proxy` のservice account policyにだけ付与します。GitHub ActionsからのimpersonationはADR 0010のWIF conditionでworkflow単位に制限します。

`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com` には、`roles/editor` を含むプロジェクトロールを付与しません。現在の `cakb-dev` は組織・フォルダ配下ではないため、Cloud Asset Inventoryでbindingがない状態を定期監査します。将来Organization Policy Administratorを管理できる組織配下へ移した場合は、`constraints/iam.managed.preventPrivilegedBasicRolesForDefaultServiceAccounts` をenforceし、既定service accountへのOwnerまたはEditor再付与を防ぎます。

## 変更前監査

IAM変更前は、対象principalの参照、実行中service、直近buildを確認します。

```powershell
gcloud asset search-all-iam-policies `
  --scope=projects/cakb-dev `
  --query="policy:PRINCIPAL_EMAIL"

gcloud run services list `
  --project=cakb-dev `
  --region=asia-northeast1 `
  --format="table(metadata.name,spec.template.spec.serviceAccountName)"

gcloud builds list `
  --project=cakb-dev `
  --region=asia-northeast1 `
  --limit=20 `
  --format="table(id,createTime,status,serviceAccount)"
```

権限削除では、完全な変更後IAM policyを一時ファイルへ作成し、Policy Simulatorの `replay-recent-access` で直近90日のアクセス差分を確認します。一時ファイルにcredentialや家計簿データを含めず、リポジトリへcommitしません。

## 変更後確認

1. Cloud Asset Inventoryで削除対象bindingが残っていないことを確認する。
2. Firebase Hosting / Firestore Rules workflowを手動実行する。
3. Cloud Run workflowを手動実行し、最新Cloud Buildが `cakb-cloud-run-builder` を使用したことを確認する。
4. Firebase HostingのHTTP 200、Proxy `/health` のHTTP 200、未認証OCRのHTTP 401を確認する。
5. `docs/project-status.md` と `docs/development-history.md` に結果を記録する。

`cakb-dev` では、WIF移行やIAM変更後にも上記確認を実施します。Cloud Asset InventoryとPolicy SimulatorのAPIはIAM監査専用として使用し、シミュレーション用policyはリポジトリへ保存しません。

## 復旧方針

既定Compute service accountへEditorを戻すことは復旧手順にしません。

1. 失敗したworkflow、Cloud Build、Cloud Run revisionのエラーから不足permissionを特定する。
2. deploy、build、runtimeのどのidentityに必要かを確認する。
3. Google Cloudの定義済みロールから必要最小限のロールを選び、対象の専用service accountだけへ付与する。
4. Cloud Runの即時復旧が必要なら、既存の正常revisionへtrafficを戻す。再buildは行わない。
5. IAM変更をADRまたは運用履歴へ記録し、再デプロイとsmoke testを実施する。
