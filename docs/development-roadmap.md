# Development Roadmap

Last Updated: 2026-07-20

## 方針

caKbは、Google Vision OCRで実レシートの読み取り精度を確保しつつ、保存前に必ずユーザーが確認・修正する家計簿として育てる。

短期はOCR候補抽出と品目明細の安定化を優先する。中期はFirebase Auth / Firestoreを使って家族共有できるクラウド家計簿へ移行する。長期はGoogle Sheets一方向同期と品目別活用を検討する。

## Phase 1: OCR確認体験と品目明細の安定化

- Google Vision OCR結果を前提に、店舗名、総額、品目、割引、税の候補抽出を継続調整する。
- 実レシートOCR結果は匿名化して回帰テストへ追加する。
- 品目明細は支出の付加情報として扱い、月次、年次、カテゴリ集計の正本は `Expense.amount` のまま維持する。
- 品目合計と総額との差分は、税、割引、OCR欠落の確認材料として表示する。

## Phase 2: 運用基盤の整理

- 正規確認URLは Firebase Hosting の `https://cakb-dev.firebaseapp.com` とする。
- `main` へのpushで Firebase Hosting へ自動デプロイする。
- GitHub Pagesは通常デプロイ対象から外し、必要時の手動実行のみ残す。
- Google Vision ProxyはFirebase ID token検証とactive household membership認可を維持する。
- UID単位の短時間レート制限とFirestore月間上限を適用する。共有トークンと監査ログ方針は必要性を継続判断する。
- クラウド移行結果をユーザープロファイルへ記録し、再読み込み後も最終移行日時と件数を確認できるようにする。
- Firestore RulesをEmulatorで検証し、Hostingと同じworkflowで配布する。
- PWA更新通知から利用者が明示的に最新版へ切り替えられるようにする。

## Phase 3: Firestore正本化

- `BudgetRepository` 境界を維持し、UIからFirestoreを直接操作しない。
- 支出、カテゴリ、店舗別カテゴリルール、品目明細をFirestoreへ保存する。
- IndexedDBは移行元またはローカルキャッシュとして扱う。
- Firestore Security Rulesのテストを追加し、家計簿メンバー以外が読めないことを検証する。

Firestore正本化とローカルデータ移行は完了。以後は移行の運用確認と家族共有機能で必要なRules拡張を継続する。

## Phase 4: 家族共有

- Firebase AuthのGoogleログインを前提に、`household` と `members` を正式導入する。
- 初期権限は `owner` と `member` に絞る。
- 招待コードで家族メンバーを追加する。
- メンバーはレシート登録、支出編集、カテゴリ利用ができる。

期限付き・1回限りの招待コード、家族参加、メンバー一覧、管理者による解除までのMVPは完了。今後は複数端末での実機確認、登録者表示、共有店舗カテゴリルールのFirestore正本化を進める。

Firestoreの支出・カテゴリはリアルタイム購読に対応し、支出一覧で登録者を確認できる。メンバー解除後は購読権限エラーを検知して再読み込み・ログアウトへ誘導し、Google Vision OCRもactive household memberだけに許可する。次は共有店舗カテゴリルールのFirestore正本化と複数端末での競合確認を進める。

店舗別カテゴリルールのFirestore正本化とリアルタイム共有、支出更新・削除時の楽観的競合検知、Google Vision利用量制御まで完了。次は管理者・家族の別端末実機検証後、Google Sheets一方向同期を進める。

## Phase 5: Google Sheets一方向同期

- Firestoreを正本として、Google Sheetsへ一方向で出力する。
- 初期版は支出1件を1行として出力する。
- 品目別行出力、Sheets側編集の取り込み、双方向同期は初期対象外にする。

owner専用の手動全件出力、`caKb支出` タブ作成・置換、同期設定と最終結果のFirestore保存まで完了。次は実スプレッドシートでの列構成確認後、自動実行や差分同期が必要かを判断する。

## Phase 6: 品目別活用

- 品目明細の精度が安定してから、品目別カテゴリや品目別集計を検討する。
- `ExpenseLineItem.categoryId?` の追加は、必要になった時点でADRを追加して判断する。
- 商品マスタ、バーコード、単価、数量の厳密管理は当面対象外にする。
