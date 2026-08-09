# Firebase Cloud Setup

caKbを家族共有対応へ進めるためのFirebase初期設定メモです。この手順はまだ本番切替ではなく、認証UI、Firestore移行UI、Sheets同期を追加する前提準備です。

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
4. GitHub Actionsの `Deploy Firebase Hosting` workflowを実行する

GitHub ActionsはOIDCで短時間認証し、service account JSON、token、secretを保存しません。WIFの決定と失効手順は `docs/decisions/0010-github-actions-wif-deploy-auth.md` を参照してください。公開先はFirebase Hostingに統一し、GitHub Pages workflowは使用しません。

## Firestore Data Shape

初期方針では、家計簿データはhousehold配下にまとめます。

```text
users/{uid}
households/{householdId}
households/{householdId}/members/{uid}
households/{householdId}/expenses/{expenseId}
households/{householdId}/categories/{categoryId}
households/{householdId}/shopCategoryRules/{ruleId}
households/{householdId}/sheetSyncSettings/default
```

`members/{uid}` には `owner` または `member` roleを持たせます。初期版ではowner/memberの2権限だけを扱います。

## Security Rules

初期Rulesは `firestore.rules` にあります。

実デプロイ前に確認すること:

- ownerがhouseholdを作成し、自分のmember recordを作れる
- household memberだけが支出、カテゴリ、店舗カテゴリルールを読める
- sheet sync settingsはownerだけが編集できる
- 未ログインユーザーがすべて拒否される

## Migration Direction

IndexedDBからFirestoreへの移行は自動実行しません。ログイン後、設定画面のクラウド家計簿セクションで明示ボタンを押した場合のみ以下をコピーします。

- expenses
- categories
- settings.shopCategoryRules

レシート画像Blobは初期移行対象外です。必要になった場合はCloud Storage、保存期間、家族閲覧権限、削除方針を別ADRで決めます。

現時点の移行はコピーのみです。移行後も、アプリの支出登録、一覧、編集、削除はIndexedDBを正本として動作します。Firestoreを正本に切り替えるには、Firestore cloud repositoryと同期/競合方針の実装が必要です。

## Next Implementation Steps

1. Google Vision Proxyを再デプロイし、ログイン済みのレシート読み取りを確認する
2. Firestore cloud repositoryを追加する
3. IndexedDBからFirestoreへの手動移行後にクラウド正本へ切り替えるUIを追加する
4. 家族招待コードとmember権限UIを追加する
