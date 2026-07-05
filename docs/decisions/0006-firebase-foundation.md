# ADR 0006: Firebase Auth / Firestore Foundation

Date: 2026-07-05

## Status

Accepted

## Context

ADR 0005で、家族共有に向けてFirebase AuthとCloud Firestoreを第一候補にする方針を決めた。実装を一気にクラウド正本へ切り替えると、既存のIndexedDB保存、OCR確認保存、JSONバックアップ/復元への影響が大きい。

そのため、まずFirebase SDK、環境変数、Firestore path、Security Rules、Repository境界を追加し、現行のローカル正本動作を維持したまま次ステップの認証UIと移行UIを実装できる状態にする。

## Decision

- Firebase Web SDKを追加する。
- Firebase client configは `VITE_FIREBASE_*` 環境変数から読み取る。
- 設定が未入力の場合、Firebase client servicesは初期化せず、現行ローカル動作を維持する。
- Firestore pathは `households/{householdId}` 配下に家計簿データを置く構造とする。
- `users/{uid}` はユーザーprofile、`households/{householdId}/members/{uid}` は家計簿メンバー権限に使う。
- 既存IndexedDB処理は `BudgetRepository` interfaceと `localBudgetRepository` 経由に寄せる。
- Firestore Security Rules雛形を追加するが、この段階ではまだ本番デプロイしない。

## Consequences

- `firebase` がfrontend依存に追加される。
- 現時点ではログインUI、Firestore CRUD、ローカルからクラウドへの移行UIは未実装。
- Firebase設定値はrepoへ入れず、`.env` またはGitHub variablesで管理する。
- Firestore Rulesは初期雛形のため、実デプロイ前にRules testと実データ形状に合わせた検証が必要。
- Google Vision Proxyの認証強化は次ステップでFirebase ID token検証を追加する。

## Alternatives

- Firebase SDK追加を認証UI実装時まで遅らせる: 依存追加は遅らせられるが、Repository境界とSecurity Rulesの検討も遅れる。
- REST API経由でFirestoreを使う: SDK依存は減るが、Auth連携と型安全性が弱くなる。
- Cloud Functions経由で全DB操作を行う: 権限制御を集中できるが、初期実装と運用が重くなる。
