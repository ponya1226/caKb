# Firebase Cloud Setup

caKbのFirebase Authentication、Cloud Firestore、Firebase Hostingを設定・運用するためのメモです。

## 前提

- Firebase projectを作成する
- AuthenticationでGoogle providerを有効化する
- Cloud Firestoreを作成する
- Firebase Hostingを有効化する
- 初期の正規URLは `https://cakb-dev.firebaseapp.com` とする

## Frontend Environment Variables

`.env` またはGitHub Actions Repository variablesに以下を設定します。値はFirebase ConsoleのWeb app設定から取得します。

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

Firebase Web API keyは公開クライアント設定ですが、実値はrepoへコミットしません。`.env.example` だけを管理対象にします。

Firebase Hostingへ移行する場合、`VITE_FIREBASE_AUTH_DOMAIN` は初期値として `cakb-dev.firebaseapp.com` を使います。Firebase ConsoleのAuthentication > Settings > Authorized domainsにも `cakb-dev.firebaseapp.com` が含まれていることを確認します。

## Firebase Hosting Deploy

repoにはHosting設定を含む `firebase.json` と `.firebaserc` を追加しています。

ローカルから手動deployする場合:

```powershell
npm run build
npx firebase-tools deploy --only hosting --project cakb-dev
```

GitHub Actionsからdeployする場合:

1. `github-actions` WIF pool/providerを構成する
2. provider conditionで対象repository、`main` branch、Hosting workflowを固定する
3. Hosting workflowの `workflow_ref` だけが `github-firebase-hosting-deploy` service accountを利用できるように `roles/iam.workloadIdentityUser` を付与する
4. GitHubに `staging` と `production` environmentsを作成し、両方をprotected branch限定にする
5. `production` environmentに管理者をrequired reviewerとして設定する
6. GitHub Actionsの `Deploy Firebase Hosting` workflowを実行する

GitHub ActionsはOIDCで短時間認証し、service account JSON、token、secretを保存しません。WIFの決定と失効手順は `docs/decisions/0010-github-actions-wif-deploy-auth.md` を参照してください。公開先はFirebase Hostingに統一し、GitHub Pages workflowは使用しません。

`main` へのmerge後は次の順で配布します。

1. production buildを固定preview channel `staging` へ30日間の有効期限で配布する
2. staging URL上で未ログイン画面とIndexedDB支出CRUDのPlaywright smoke testを実行する
3. GitHubの `production` environmentで管理者承認を待つ
4. 承認後にFirestore Rulesを配布する
5. stagingで検証したHosting versionを `live` へcloneする
6. `https://cakb-dev.firebaseapp.com/` の応答を確認する

stagingは同じ `cakb-dev` project上のHosting previewです。Authentication、Firestore、Cloud Runを分離した検証環境ではないため、CIでは実アカウント、実レシート、クラウド家計簿データを使いません。詳細は `docs/decisions/0013-staging-production-deploy-gate.md` を参照してください。

## Firestore Data Shape

初期方針では、家計簿データはhousehold配下にまとめます。

```text
users/{uid}
familyOwnerAuthorizations/{uid}
households/{householdId}
households/{householdId}/members/{uid}
households/{householdId}/expenses/{expenseId}
households/{householdId}/categories/{categoryId}
households/{householdId}/shopCategoryRules/{ruleId}
households/{householdId}/sheetSyncSettings/default
```

`members/{uid}` には `owner` または `member` roleを持たせます。初期版ではowner/memberの2権限だけを扱います。

## Family-only Bootstrap

既存householdを利用する通常運用では追加設定は不要です。新しいFirebase環境で最初のhouseholdを作る場合だけ、Firebase Consoleまたは管理者権限を持つ運用手段から次のドキュメントを事前登録します。実UIDをrepositoryへ記録しないでください。

```text
familyOwnerAuthorizations/{ownerUid}
  uid: {ownerUid}
  householdId: family-primary
  active: true
```

ログインしたUIDとドキュメントID・`uid` が一致し、作成先が指定した `householdId` と一致する場合だけ初期作成UIとRulesが許可します。作成成功後は `active` を `false` に変更できます。authorizationはクライアントから作成・変更・削除できません。家族メンバーはownerが発行した期限付き・1回限りの招待コードで参加します。

## Security Rules

初期Rulesは `firestore.rules` にあります。

実デプロイ前に確認すること:

- 事前許可されたownerだけが指定householdを作成し、自分のmember recordを作れる
- 未許可の認証済み利用者はhouseholdを作成できず、authorizationを書き換えられない
- household memberだけが支出、カテゴリ、店舗カテゴリルールを読める
- sheet sync settingsはownerだけが編集できる
- 未ログインユーザーがすべて拒否される

## Migration Direction

IndexedDBからFirestoreへの移行は自動実行しません。ログイン後、設定画面のクラウド家計簿セクションで明示ボタンを押した場合のみ以下をコピーします。

- expenses
- categories
- settings.shopCategoryRules

レシート画像Blobは初期移行対象外です。必要になった場合はCloud Storage、保存期間、家族閲覧権限、削除方針を別ADRで決めます。

現時点の移行はコピーのみです。通常利用の支出登録、一覧、編集、削除はFirestoreを唯一の正本として動作します。IndexedDBは旧データの移行元、要確認Inbox、test harnessに限定し、家計簿fallbackとしては利用しません。

## Operational Checks

1. staging smoke test成功後だけproductionを承認する
2. Firebase Hosting本番URLで更新バナーと主要画面を確認する
3. Rules変更時は既存アプリとの後方互換性を確認する
4. Authentication、Firestore、家族共有に影響する変更はowner/memberの別アカウントで実機確認する
