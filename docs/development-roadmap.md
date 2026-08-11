# Development Roadmap

Last Updated: 2026-08-11

## Product Direction

caKbの中心コンセプトは「家計簿をつけなくていい家計簿」とする。

競合の機能数やGoogle Vision自体を差別化要因にせず、家計簿を記録するために必要な利用者操作を限りなくゼロにする。通常利用は「レシートを撮る、終了」を目標とし、全件確認ではなくConfidence-based Exception Handlingを採用する。

- High confidence: 自動保存
- Lowまたはuncertain confidence: 要確認
- 誤った総額の自動保存を最重要failureとして扱う
- 品目明細は付加情報、日付・総額・店舗・カテゴリを支出の正本として優先する
- セキュリティ、外部送信説明、household認可、production deploy gateはUX簡略化後も維持する

詳細は `docs/decisions/0014-capture-first-auto-save-direction.md` に従う。

## Step A: 写真を撮るだけで記録完了

最優先フェーズ。Step Aが安定するまで、新しい分析APIや大規模機能へ進まない。

### A1: 単体レシートの最初の縦切り

- ホームの最優先操作を「レシートを撮る」にする。
- 撮影後、単体画像は追加操作なしでGoogle Visionへ送る。
- `receiptParser.ts` の候補を説明可能なConfidence信号で判定する。
- 店舗ルールまたは同一・類似店舗履歴でカテゴリを解決でき、日付・店舗・総額が安全な場合だけ自動保存する。
- 自動保存後に短時間のUndoを提供する。
- 判断できない結果は理由付きで既存確認画面へ送る。
- 匿名fixtureでスーパー、コンビニ、専門店、残高、競合金額、日付欠落、店舗欠落、OCR部分失敗を検証する。

### A2: 要確認Inboxと評価

- 要確認ドラフトを撮影端末へ最大7日一時保存する最小Inbox、再読み込み復元、保存・破棄・期限削除まで完了。
- ホームの要確認件数表示と既存確認画面への復元まで完了。
- 管理者・家族のスマホ実機でHigh自動保存、Low要確認、Undo、Inbox復元・保存・破棄を確認済み。
- 個人情報やOCR全文を送らず、自動保存率、要確認理由、Undo率、要確認時の総額修正率を端末内で月別集計する仕組みまで完了。
- 匿名fixtureで誤判定がないことを確認してから閾値を調整する。
- 店舗ルール、履歴に続く決定論的なデフォルトカテゴリ推定が安全か検証する。

### A3: 一括撮影への拡張

- 画像ごとにConfidence判定し、Highだけを自動保存する。
- Lowだけを要確認キューへ残し、成功済み支出と明確に区別する。
- 失敗分だけの再試行、途中離脱時の復元、重複保存防止を検証する。

## Step B: 何もしなくても家計状況が分かる

Step Aの安全性と利用実績を確認した後に着手する。

- 今月の支出と前月比
- カテゴリ別の増減
- 支出増加要因
- 月末支出予測

ホームは撮影CTA、今月の支出、前月比、要確認件数を中心にし、管理、家族、出力機能を主画面へ出さない。既存の月次、年次、カテゴリ集計は `Expense.amount` を正本として継続する。

## Step C: 家計データへの自然言語質問

「今月コンビニでいくら使ったか」などの自然言語質問は長期候補とする。外部LLM、送信データ、費用、回答根拠、誤回答時の扱いを別ADRで決めるまで実装しない。

## Maintained Foundations

- Firebase Hosting、Firebase Auth、Cloud Firestoreによる家族のクラウド家計簿
- owner/memberの導線分離、招待、member解除、Firestore Rulesによるhousehold分離
- Google Vision自前Proxy、Firebase ID token、active household membership、利用量制限
- IndexedDB local repositoryとFirestore cloud repositoryの `BudgetRepository` 境界
- 店舗別カテゴリルールと同一・類似店舗履歴
- 品目明細、月次・年次集計、検索・フィルタ、バックアップ、CSV、Google Sheets一方向出力
- Pull Request CI、Playwright、WIF/OIDC、staging preview、production承認ゲート

これらはStep Aを支える既存基盤として維持する。利用者の通常フローへ管理操作を戻さない。

## Deferred

- 銀行口座、クレジットカード、証券、資産、ポイント連携
- 高度な予算管理
- 新しいOCR Provider、Tesseract.js復活
- 外部LLM API、複雑なAIエージェント
- 商品マスタ、バーコード、厳密な単価・数量管理
- Google Sheets双方向同期
- 品目別カテゴリ集計と品目別自動カテゴライズ

対象外機能を追加する場合は、利用者操作を本当に減らすかを再評価し、必要なADRと明示承認を得る。
