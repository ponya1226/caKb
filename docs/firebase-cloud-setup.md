# Firebase Cloud Setup

caKbを家族共有対応へ進めるためのFirebase初期設定メモです。この手順はまだ本番切替ではなく、認証UI、Firestore移行UI、Sheets同期を追加する前提準備です。

## 前提

- Firebase projectを作成する
- AuthenticationでGoogle providerを有効化する
- Cloud Firestoreを作成する
- Firebase Hostingは現時点では必須ではありません。既存のGitHub Pages配信を継続できます。

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

IndexedDBからFirestoreへの移行は自動実行しません。ログイン後に明示ボタンで以下をコピーします。

- expenses
- categories
- settings.shopCategoryRules

レシート画像Blobは初期移行対象外です。必要になった場合はCloud Storage、保存期間、家族閲覧権限、削除方針を別ADRで決めます。

## Next Implementation Steps

1. Firebase AuthのGoogleログインUIを追加する
2. ログイン済みユーザーprofileを `users/{uid}` に作成する
3. household作成UIとowner member作成を追加する
4. IndexedDBからFirestoreへの手動移行UIを追加する
5. Google Vision ProxyにFirebase ID token検証を追加する
