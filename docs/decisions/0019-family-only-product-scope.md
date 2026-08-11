# ADR 0019: 特定家族だけに閉じたプロダクト運用

Date: 2026-08-11

## Status

Accepted

## Context

caKbは家族共有、Firebase Authentication、Cloud Firestore、Google Vision OCRを備え、将来の商用展開も検討していた。一方、現在の利用目的は特定の一家庭でレシート登録の操作を減らすことであり、不特定利用者向けの提供、複数世帯のセルフサービス登録、課金や利用者獲得の準備は、家庭内利用の品質向上に直接寄与しない。

Googleログインとhousehold membershipによって既存データは分離されているが、未所属の認証済み利用者が新しいhouseholdを作成できる導線とRulesが残っていた。この状態は、特定家族だけに閉じる新しい対象範囲と一致しない。

## Decision

- caKbの対象利用者を、管理者が明示的に許可または招待した特定の家族に限定する。
- 商用リリース、一般利用者の獲得、不特定世帯への提供をロードマップから外す。
- 未所属の通常利用者は、ownerが発行した期限付き・1回限りの招待コードでのみ既存householdへ参加できる。
- householdの初期作成は、Firestoreのサーバー管理ドキュメント `familyOwnerAuthorizations/{uid}` で事前許可されたownerだけに認める。
- 初期作成許可には、対象UID、作成可能な固定household ID、active状態を持たせる。クライアントから作成・変更・削除はできない。
- 既存household、owner/member role、招待、member解除、Firestoreを正本とする保存形式は維持する。
- `production` は検証済み配信先を示す技術的な環境名として維持し、商用提供を意味しない。
- 商用化または不特定世帯への提供を再開する場合は、新しいADRと明示承認を必須とする。

## Product Scope

優先する開発:

- 家族の実レシートに対する自動登録率、安全性、復旧性
- owner/memberの招待、解除、権限反映
- 家族固有の店舗・カテゴリルール
- 家庭内の月次・年次把握と、運用費用の上限管理
- バックアップ、障害対応、アカウント復旧

対象外:

- 公開サインアップと任意のhousehold作成
- 課金、サブスクリプション、料金プラン、広告
- 一般公開用の管理コンソール、マーケティング、SEO、利用者獲得分析
- 不特定利用者向けSLA、問い合わせ運用、商用向け法務機能
- 商用化だけを理由とする汎用化や大規模なマルチテナント拡張

## Access Model

```text
Google login
  -> existing active household member: use caKb
  -> invited family member: consume one-time invite and join
  -> pre-authorized bootstrap owner: create designated household once
  -> other authenticated user: no ledger access and no household creation
```

メールアドレスやUIDをソースコード、公開GitHub Variables、クライアントだけの判定へ埋め込まない。アクセスの正本はFirestore Rules、household membership、Google Vision Proxyのmembership確認とする。

GoogleログインだけではFirestoreへ利用者プロフィールを作成せず、事前許可された初期作成または有効な招待コードによる参加が成立した時点でプロフィールを保存する。Firebase Authentication側の認証アカウント作成はGoogleログインの仕様として発生する。

## Security And Privacy

家族限定であっても、Firebase Authentication、Firestore Rules、household分離、Google Vision Proxy認証、画像非永続化、WIF/OIDC、production deploy gateを緩和しない。公開GitHubリポジトリと公開到達可能なHosting URLは、家計データへのアクセス許可を意味しない。

## Alternatives Considered

- 認証済みなら誰でもhouseholdを作成可能な状態を維持する: 一般提供に近い挙動が残るため不採用。
- メールアドレスをフロントエンドへハードコードする: 回避可能で個人情報も公開されるため不採用。
- Firebase Hosting自体を非公開化する: PWAとGoogleログインの運用が複雑になる一方、Rulesとmembershipでデータ境界を作れるため現時点では不採用。
- household作成を全面禁止する: 既存運用には十分だが、障害復旧や環境再構築時の安全な初期化経路が失われるため、事前許可方式を採用。

## Consequences

- 未所属利用者の通常画面は招待コード入力だけになり、操作と対象範囲が明確になる。
- 既存の家族と支出データにはmigrationが不要。
- 新しい環境で最初のhouseholdを作る場合、管理者がFirebase Consoleまたは管理者権限のある運用手段でauthorizationを事前登録する必要がある。
- 不特定利用者向けのスケール、課金、法務、サポート準備は行わないため、将来商用化を再開する場合は再設計が必要になる。
- 家族利用であってもクラウド障害、アカウント喪失、費用超過への運用対策は引き続き必要になる。
