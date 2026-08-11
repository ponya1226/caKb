# ADR 0018: オンライン認証済みクラウド家計簿への一本化

Date: 2026-08-11

## Status

Accepted

## Context

caKbはFirebase Auth、Cloud Firestore、家族householdを導入した後も、未ログイン、Firebase未設定、household未作成の場合にIndexedDBのローカル家計簿へ自動フォールバックしていた。この二重動作は、利用者が保存先を判断する必要を生み、端末ごとのデータ分散、移行漏れ、家族間の表示差、テストと障害対応の複雑化につながる。

現在の中心価値は、家族が同じ家計簿を使い、撮影後の操作を減らすことである。支出正本としてのローカル家計簿には継続価値がなく、暗黙のフォールバックはクラウド正本化と整合しない。

## Decision

- 利用者向けアプリはオンライン接続、Firebase設定、Googleログイン、active householdを必須とする。
- 起動順序を「接続確認、認証確認、Googleログイン、household作成または参加、Firestore接続、通常画面」に固定する。
- Firestore接続済みの `BudgetRepository` だけを通常画面へ渡し、未認証またはhousehold未確定時に `localBudgetRepository` へフォールバックしない。
- オフライン、再接続中、権限喪失時は家計画面を操作させず、状態説明、再試行、必要に応じたログアウトを提供する。
- オフライン書き込みキュー、ローカル支出の新規作成、復帰後の自動同期は実装しない。
- Firebase設定がないbuildはローカル家計簿を起動せず、管理者向け設定不足画面を表示する。

## Device-local Data

IndexedDBとlocalStorageは完全には削除せず、次の用途へ限定する。

- ADR 0015の要確認レシートInbox
- ADR 0016・0017の匿名自動登録品質集計
- 既存ローカル支出、カテゴリ、店舗ルールの明示的なクラウド移行元
- 自動テスト用のlocal repository
- PWAと端末固有設定

既存ローカルデータの移行はownerが明示的に実行する。クラウドへの保存完了を確認する前にローカルデータを削除しない。移行機能を将来廃止する場合は、利用状況と告知期間を別途決定する。

`Expense`、Firestore、IndexedDB、要確認Inbox、JSON、CSV、Google Sheetsのschemaは変更しない。

## UX

- 未ログイン時は家計画面や手入力ボタンを表示せず、Googleログインを主操作にする。
- ログイン済みでhouseholdがない場合だけ、家計簿の作成と招待コード参加を表示する。
- 一時的な切断では「この端末へ保存する」代替動線を出さず、接続復旧を案内する。
- 通常画面のヘッダーは家計簿名と接続状態だけを表示し、ローカル／クラウド選択を利用者へ要求しない。
- 端末容量、IndexedDB永続化、確定後レシート画像保存など、クラウド正本では効果がない設定を通常画面から除去する。

## Security And Privacy

- Firebase Authとactive household membershipの確認を通常画面表示前に必須とする。
- Firestore Rulesによるhousehold分離、Google Vision ProxyのID tokenとmembership確認を維持する。
- Firestoreの永続オフラインキャッシュは、共有端末への情報残留を避けるため有効化しない。
- オンライン必須化を理由に、要確認画像をクラウド保存したり、レシート画像やOCR全文をログへ送ったりしない。
- secret、service account key、tokenをフロントエンドやrepositoryへ追加しない。

## Alternatives Considered

- ローカル／クラウド選択を設定として残す: 利用者判断と分散データを残すため採用しない。
- オフライン時だけローカルへ保存し、後から自動同期する: 競合、重複、画像保持、暗号化、再送制御が必要になり、現在の価値に対して複雑すぎるため採用しない。
- IndexedDB関連コードをすべて削除する: 要確認Inbox、品質集計、既存データ救済、テストで必要なため採用しない。
- 認証済みならオフラインでも最後のデータを表示する: 共有端末への情報残留と古いデータへの誤操作を避けるため、初期段階では採用しない。

## Consequences

- 利用者は保存先を選ばず、同じhouseholdのクラウドデータだけを扱う。
- 未ログイン、通信障害、Firebase障害時は家計簿を利用できない。
- ローカル／クラウド分岐によるsplit-brainと、意図しない端末保存を解消できる。
- 既存ローカルデータの救済導線は当面維持する必要がある。
- 開発時もFirebase設定がない通常buildでは家計機能を操作できないため、local repositoryは専用テストharnessで検証する。
