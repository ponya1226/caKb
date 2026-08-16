# Project Status

Last Updated: 2026-08-16

## Implemented

- ADR 0019により商用リリースと一般公開登録を停止し、管理者が招待した特定家族だけを対象とする方針へ変更
- 未所属利用者の通常画面を招待コード参加へ限定し、household初期作成をサーバー管理authorizationで事前許可されたownerだけに制限
- Firestore Rulesで未許可ユーザーのhousehold作成と、authorizationのクライアント書き換えを拒否
- ADR 0018により、通常利用をオンライン接続、Firebase設定、Googleログイン、active householdが揃ったクラウド家計簿へ一本化
- 未認証、household未確定、オフライン、再接続中のIndexedDB家計簿フォールバックを廃止し、必要な復旧操作だけを表示するアクセスゲートを追加
- Firestore接続が `online` 以外の間は支出一覧、撮影、手入力、設定を含む家計操作全体を遮断し、ローカル代替保存とオフラインキューを不採用
- 通常ヘッダーを家計簿名、同期状態、クラウド表示へ統一し、端末容量、永続化、確定後画像保存などクラウド正本では不要な設定を削除
- IndexedDB支出・カテゴリはownerの旧データ移行元とtest harnessに限定し、要確認Inboxと匿名品質集計の端末内保持を継続

- 中心コンセプトを「家計簿をつけなくていい家計簿」へ変更し、ADR 0014で全件確認からConfidence-based Exception Handlingへ移行
- OCR成功、総額、日付、店舗、カテゴリ、競合金額、残高、品目整合性を説明可能な信号として返す決定論的Confidence判定
- `receipt-confidence-v5` で、品目合計が総額または印字税額加算後の総額と完全一致しない読み取りに加え、小計差分補完や複数候補の曖昧対応を要確認へ送るゲート
- 課税対象額と税込金額を消費税額から除外し、税抜品目合計へ課税対象額を重複加算して不要な要確認にする問題を修正
- ホームセンター形式で、Google Vision全文内の金額列が本文末尾へ移動しても単語座標から6品目を復元し、`現計`を支払総額として選択
- ホームセンター形式で、品目金額が次行と小計後へ分離し、単語座標側が一部品目を欠落しても、印字点数と小計に整合するOCR全文側の6品目を選択
- `#0012`など先頭の部門コードを品目金額から除外し、小計以降の会員ランク・ポイント対象額を品目候補へ混入させない領域境界
- `計`単独行と`外税計`を区別し、預り金、釣銭、残高、ポイント対象額、会員ランク金額を支払総額候補から除外
- 明細税額と税額合計が同時に印字された場合は明細税額だけを照合へ利用し、税率の数値を税額に含めない
- コンビニ、スーパー、専門店、食品スーパー、ホームセンター、部分失敗の13件を共有する匿名レシート品質コーパスと、総額・品目・Confidence判定の定量ゲート
- 消費税額を品目候補とは別に抽出し、`lineItemMatchBasis` で総額との照合根拠を保持
- 品目候補の `extractionMethod` で同一行、前後行、割引、小計差分、単品補完、曖昧対応を説明可能に保持
- 長い品目明細の支出再編集モーダルを動的viewport、縦pan、慣性スクロールへ対応
- 支出再編集では品目明細を初期展開し、入力欄へすぐアクセス可能
- 食品スーパー形式の割引率、商品名、割引額、商品価格が別行になったOCR結果を対応付け、`特`付き金額行と同一商品複数行を欠落させず保持
- High confidenceな単体レシートの確認画面なし自動保存と、登録直後10秒間のUndo
- Lowまたはuncertainな単体レシートの理由付き要確認画面へのフォールバック
- ホームの最優先「レシートを撮る」からネイティブカメラを開き、撮影後に単体レシートを自動読取
- 残高、競合金額、日付・店舗欠落、OCR部分失敗を含む匿名Confidence fixtureとPlaywright回帰テスト
- 要確認レシートを撮影端末へ最大7日一時保存するInbox、再読み込み復元、ホーム件数表示、保存・破棄・期限切れ削除
- IndexedDB version 1から2への非破壊upgradeとhousehold scope付き `pendingReceiptReviews` store。Firestore、バックアップ、CSV、Sheetsのschema変更なし
- 管理者・家族のスマホ実機でHigh自動保存、Low要確認、10秒Undo、Inboxの復元・保存・破棄を確認
- 自動保存率、要確認理由、Undo率、要確認時の総額修正率を、レシート内容なしでhousehold別・月別・Confidence判定ルール別に最大12か月保持する端末内集計
- アカウント画面の折りたたみ領域で、memberを含む利用者が過去月を閲覧して匿名集計をコピーでき、household ownerだけが消去できる権限制御
- 旧v1集計を `legacy` 判定ルールとして読み、次回記録時にv2へ非破壊移行する互換処理

- Pull Request向けFrontend、Firestore Rules、Google Vision Proxy、Dependency Review CI
- PlaywrightとChromiumによるスマホ向けBrowser Smoke CI。クラウド必須ゲート、オフライン遮断、Googleの文字読み取り固定、専用test harnessの支出CRUD、匿名fixtureの例外確認、横overflowを検証
- Dependabotによるnpm、GitHub Actions、Docker base imageの週次更新
- GitHub Actionsのcommit SHA固定とNode.js 24への実行環境統一
- GitHub OIDCとWorkload Identity Federationによる鍵なしproduction deploy
- Firebase Hosting固定staging previewへの自動配布と、配信URLに対するPlaywright browser smoke test
- GitHub production environmentのrequired reviewer承認後に、検証済みHosting versionを本番へ昇格するdeploy gate
- Firebase Hosting/Firestore RulesとCloud Runのdeploy service account分離
- Cloud Run source build専用service accountと `roles/run.builder` による既定Compute identityからの分離
- 既定Compute service accountのEditor削除、Cloud Asset / Policy Simulator監査、IAM運用基準の文書化
- 旧GitHub deploy Secret、ユーザー管理service account key、共有deployerのCloud Run/Build/Storage権限削除
- 脆弱性の非公開報告手順、SDLC、ロールバック方針の文書化
- ルート依存関係の既知脆弱性解消と、Proxy依存関係のhigh以上の既知脆弱性解消
- 下部ナビゲーションの「設定」を「アカウント」へ変更し、ログイン、家計簿、接続状態、参加メンバーを通常利用者向けに集約
- クラウド家計簿のmemberには管理機能を描画せず、owner向けの招待、移行、カテゴリ、店舗ルール、バックアップ、Sheets出力を折りたたみの管理者メニューへ集約
- 利用者向けレシート読み取りをGoogle Visionと画像全体に固定し、Provider選択、範囲調整、画像補正、端末内読み取りへのフォールバックを通常画面から削除
- 読み取り失敗時の導線を再試行、ログイン、手入力に統一し、外部送信とサーバー非保存の注意表示を維持

- Google Visionの単語座標を使い、同じ印字行の商品名と右側金額を位置順に再構成して品目候補を抽出
- 単語座標がない旧Proxy・端末内読み取りでは、従来のOCR全文解析へ自動フォールバック
- 座標付き品目解析を単体登録、一括登録、確認画面の再読み取りへ共通適用
- 1点購入レシートで品目金額の行順が崩れた場合に、領収証内の商品名と支出総額から1品目を限定補完
- 品目候補から住所、担当者、交通系・電子マネー、クレジットカード、マスク済みカード番号を除外
- 起動中のPWAでも、起動時・再表示時・5分ごとにFirebase Hostingの新しい配信を検知して更新バナーを表示
- service worker更新確認のHTTPキャッシュ回避と、PWAキャッシュ世代の更新
- 電子マネーの「残高」「支払後残高」「利用可能額」を支出総額・品目金額候補から除外し、同じ優先度で大きい残高が合計より先に選ばれる問題を修正
- 実際の改行構造を匿名化したコンビニ形式で、合計348円を選択し残高1,494円を除外する回帰テストを追加
- 利用画面の用語を家族利用者向けに統一。OCR、Google Vision、Firestore、IndexedDB、JSON、Proxyなどの実装用語を、レシート読み取り、クラウド、この端末、バックアップへ置換
- ログイン、外部読み取り、クラウド保存、スプレッドシート書き出しのエラーを、内部コードではなく次の操作が分かる案内へ変更
- `docs/ui-writing-guidelines.md` と `AGENTS.md` に利用画面の文言ルールを追加
- 匿名化したGoogle Vision OCR結果による品目抽出回帰テスト。コンビニ、総合スーパー、専門店、食品スーパー形式を検証
- 長い食品レシートの品目候補上限を20件から50件へ拡張
- 支出一覧の選択月内の日付範囲・金額範囲フィルタ。既存の検索・カテゴリ条件とAND適用
- 支出一覧の適用件数・合計表示、詳細条件の一括クリア、範囲入力エラー表示
- クラウド接続状態の `同期済み`、`オフライン`、`再接続中`、`アクセス権なし` 分類とヘッダー・設定画面表示
- 一時的なFirestore接続障害では表示済みデータを維持し、再接続操作を提供。未接続中のクラウド書き込みを明示的に拒否
- JSON置換復元を「新データ保存後に不要な旧データを削除」する順序へ変更し、途中失敗時の全消失を防止
- 複数レシートOCRの画像別処理状態、成功結果保持、失敗画像だけの再試行、成功分だけの確認導線
- GitHub Pages workflowの削除とGoogle Vision ProxyのFirebase Hosting origin限定
- Firebase HostingとCloud Runのデプロイ後smoke test
- Google Sheets一方向出力MVP: Firestoreの支出を `caKb支出` タブへ1支出1行で全件出力
- Firebase ID token、active household、owner roleによるSheets出力認可
- Cloud RunサービスアカウントのApplication Default CredentialsによるSheets API接続。鍵ファイルは不使用
- Sheets同期設定、最終出力日時、出力件数のFirestore保存とowner専用Rules
- スプレッドシートURL/ID入力、共有先コピー、出力状態、出力先リンクを含むスマホ向け設定UI
- Google Vision ProxyのUID単位短時間レート制限と、Firestoreを使った全インスタンス共通の月間上限
- レシート読み取り制限時の理由別メッセージと再試行・手入力導線
- OCR月間カウンタをクライアントから拒否するFirestore Rules回帰テスト
- ヘッダーをクラウド表示へ固定し、家計簿名、同期済み状態、クラウドバッジを表示
- Googleログイン、household、Firestore接続が成立するまで通常画面を表示しないアクセス状態分離
- 店舗別カテゴリルールのFirestore正本化と家族間リアルタイム共有。旧localStorageルールは明示的な移行元としてのみ継続
- 既存localStorage店舗ルールの明示的クラウド移行案内とJSONバックアップ互換
- 支出更新・削除時の `updatedAt` による楽観的競合検知と、上書き防止メッセージ
- Firestore Rulesで店舗別カテゴリルールをhousehold memberだけに許可する回帰テスト
- Firestoreの支出・カテゴリをリアルタイム購読し、家族の登録・編集・削除を再読み込みなしで反映
- 支出の作成者・更新者UID保持と、支出一覧での登録者表示
- 家族メンバー解除後のFirestore権限エラー検知、再読み込み・ログアウト導線
- Google Vision Proxyのactive household membership認可。メール許可リストは任意の追加制限へ変更
- Firestore Rulesでメンバー解除後に支出の読み書きが拒否される回帰テスト
- 家族共有MVP: 管理者による24時間・1回限りの招待コード発行とコピー
- Googleログイン済み利用者の招待コード参加とactive household切替
- 家計簿の参加メンバー一覧と管理者によるmember解除
- 招待消費、member作成、active household更新のFirestore transaction化
- 招待コード一覧取得、コードなしmember作成、非memberアクセスを拒否するFirestore Rules

- クラウド移行結果のFirestore永続化と、最終移行日時・件数の設定画面表示
- 同一IDへの上書きによるローカルデータ移行の重複防止を画面上で明示
- クラウド家計簿確認失敗時の再試行導線
- PWA更新検出時の最新版への更新バナー
- Firestore Emulatorによるmember/非member/owner権限のRulesテスト
- `main` push時のRulesテスト、Firebase Hosting staging検証、承認後のFirestore Rules配布と本番昇格

- Firestore cloud repositoryへの正本切替: ログイン済みかつクラウド家計簿が存在する場合、支出・カテゴリ・JSONインポート・データ初期化はFirestoreを保存先として使用
- IndexedDB local repositoryは旧データ移行と自動テスト専用として継続し、利用者向けフォールバックには使用しない
- レシート画像BlobはFirestoreへ保存せず、クラウド保存時もOCR確認後の支出データだけを保存
- クラウド移行UIはIndexedDB内データをFirestoreへコピーする入口として継続

- 支出の任意品目明細 `lineItems` 保存。OCR候補、手入力、編集、一覧詳細、JSONバックアップ、CSV `lineItemsJson`、Firestoreネストフィールド移行に対応
- OCR全文からの品目名 + 金額候補抽出。合計、税、支払、釣り、電話番号、登録番号、日付、クーポン文言は候補から除外
- 利用者によるカテゴリ追加、名称変更、色変更、未使用カテゴリ削除
- 年間支出画面: 年間合計、レシート登録分、月別支出、カテゴリ別年間支出、年間明細
- 家族共有、認証、クラウド正本化、Google Sheets一方向同期に向けた方針ADR
- Firebase Web SDK、Firebase環境変数検出、Firestore path定義
- IndexedDB local repositoryを `BudgetRepository` interface経由に整理
- Firestore Security Rules雛形とFirebase初期設定ドキュメント
- Firebase Auth Googleログイン/ログアウトUI
- Firebase Hosting移行ADR
- Firebase Hosting配信設定と `main` push時の自動deploy workflow
- Firebase Hosting上のスマホ/PWA向けGoogle redirectログイン導線
- GitHub Pages deploy workflowを削除し、Firebase Hostingを唯一の正規確認URLに整理
- 今後の開発方針を `docs/development-roadmap.md` に整理
- ログイン成功時の `users/{uid}` profile作成/更新
- Firestore上のhousehold作成とowner member作成
- IndexedDB内の支出、カテゴリ、店舗別カテゴリルールをFirestoreへ手動コピーする移行UI
- OCR候補ボタンの選択中表示
- Google Vision固定のレシート読み取り導線
- 支店名が異なる同系列店舗に対するカテゴリ推定
- 店舗別カテゴリルールのlocalStorage保存、OCR確認画面での保存導線、設定画面での追加・カテゴリ変更・削除
- 店舗別カテゴリルールを保存済み支出履歴より優先するカテゴリ初期値反映
- 店舗別カテゴリルールを含むJSONバックアップ/復元
- Google Vision OCR ProviderのPhase 1追加
- 利用者向けの単一 `receiptOcr` APIとGoogle Visionクライアント
- Google Vision Proxy呼び出しクライアント
- Google Vision Proxyサンプル実装
- Google Vision ProxyのCloud Run向けDockerfileとproduction start script
- Google Vision ProxyのFirebase ID token検証
- Google Vision Proxyのactive household membership制限
- フロントエンドからGoogle Vision ProxyへのFirebase ID token送信
- 未ログイン時の家計操作全体の制限とGoogleログイン導線
- Google Vision ProxyのCloud Run疎通確認手順
- レシート登録画面の外部送信注意表示
- Google Vision OCR結果向けの店舗候補抽出調整: ブランド行と支店行の結合候補
- Google Vision OCR結果向けの金額候補抽出調整: 合計、預かり金、お釣りの優先順位
- 保存済み店舗カテゴリ推定の店舗名揺れ対応
- PWA service workerのnetwork-first化による古いchunk参照対策
- React ErrorBoundaryによる白画面停止時の再読み込み導線

- ダッシュボードの対象月選択と過去月集計表示
- 旧ローカル家計簿向けIndexedDB保存状態とStorage Persistence設定はADR 0018によるクラウド一本化で利用画面から削除
- JSONバックアップとJSON復元

- 通貨記号付き金額とOCR崩れした1,000円表記の候補抽出改善

- Vite + React + TypeScriptのPWA土台
- IndexedDB保存
- 初期カテゴリseed
- 支出の手入力登録、編集、削除
- レシート画像アップロード、カメラ撮影入力
- OCR全文表示
- 日付、店舗名、金額候補抽出
- OCR確認画面での修正保存
- ダッシュボードの月次合計、前月比、カテゴリ別支出、日別推移
- CSVエクスポート
- データ初期化
- 旧ローカル家計簿向けの確定後レシート画像保存ON/OFFはADR 0018によるクラウド一本化で利用画面から削除
- 画面単位の遅延読み込み
- 支出一覧の店舗名、メモ、カテゴリ名検索
- 支出一覧のカテゴリフィルタ
- レシート画像の容量表示と5MB超のOCR時間注意表示
- OCR候補抽出の主要パターンに対するテスト拡充
- OCR結果全文のコピー
- 読み取り後の合計金額、認識品目、品目合計、総額との差額を、要確認画面、自動登録完了通知、支出一覧からコピーできる調査導線
- 実レシートOCRノイズに対する日付、店舗名、金額候補抽出の改善
- ノイズの強いOCRヘッダー行を店舗候補から除外
- 保存済み店舗名に基づくレシートカテゴリの自動初期値反映
- 複数レシート画像の一括OCRと1枚ずつの確認保存キュー
- ダッシュボードのレシート登録分合計、件数表示
- 複数レシート確認中の1枚単位再OCR

## Not Started

- AI分析
- 予算管理
- 定期支出

## Technical Debt

- 新規Firebase環境の初回owner作成には、管理者が `familyOwnerAuthorizations/{uid}` を事前登録し、作成後に無効化する運用が必要。既存householdの通常利用には不要。
- 要確認Inboxは撮影したブラウザprofileだけに保存され、家族の別端末には同期されない。端末間共有が必要になった場合はクラウド画像保存、暗号化、認可、削除期間を別ADRで決める必要がある。
- Confidence初期閾値は安全側で、カテゴリは店舗ルールまたは同一・類似店舗履歴がない場合に要確認となる。自動保存率、Undo率、総額修正率を評価してから緩和する。
- 自動登録品質集計は端末単位で、家族の別端末とは合算しない。判定ルールversion別に比較できるが、支出一覧で後から行った総額編集は修正率に含めない。
- 単体レシートだけがConfidence自動保存対象。複数枚は現行の全件確認キューを維持している。
- 品目不一致ゲートは抽出済み品目がある場合だけ評価する。品目が0件のレシートは `unknown` のため、完全な品目欠落をこのルールだけで検出できない。
- 回数制限付きAI品目確認は将来候補。外部サービス、送信データ、費用、household単位上限、結果確定方法を新ADRで決めるまで未実装。

- stagingは同じFirebase project上のHosting previewであり、Authentication、Firestore、Cloud Runは分離されていない。認証済み共有動線の自動統合テストが必要になった場合は別projectを検討する。
- browser E2EはFirebase設定不足、未ログイン、オフライン遮断を対象としているが、実認証済みowner/memberの自動統合テストとcoverage基準は未導入。
- Recharts 2系は保守終了警告が出ている。3系への移行影響を確認してmajor updateする必要がある。
- production buildのメインchunkは約1,015KB。Firebase importの静的・動的混在と共通chunk構成を見直す必要がある。
- Google Visionの単語座標による行再構成は実装済み。強い傾き、湾曲、複数列レイアウトでは追加調整が必要になる可能性がある。
- 品目明細は支出の付加情報として保存しており、品目別カテゴリ集計、品目別自動カテゴライズ、数量/単価、商品マスタ、Google Sheets品目別出力は未対応
- OCR品目候補は最大50件。50品目を超える非常に長いレシートは確認画面で追加入力が必要
- 支出データ正本はFirestoreへ一本化した。旧IndexedDBデータ移行をいつ廃止できるかは、実利用者の移行完了状況と告知期間を確認して別途判断する必要がある。
- Firebase HostingとCloud Runのdeploy workflowはWIF provider conditionのworkflow pathと結合している。workflow名や配置を変更する場合はGoogle Cloud側のcondition更新が必要。
- `cakb-dev` は組織・フォルダ配下ではないため、既定service accountへのOwner/Editor付与を禁止する管理制約をenforceできない。既定Compute service accountのbindingは0件で、Cloud Asset Inventoryによる定期監査を継続する。組織配下へ移す場合は管理制約を有効化する。
- Firestore Rulesの基本的なmember/非member/owner権限はEmulatorテスト済み。招待機能追加時は招待コードとmember作成条件のテスト拡充が必要。
- Google Sheets出力はownerによる手動全件置換のみ。自動実行、差分同期、再試行キュー、Sheets側変更の取り込みは未対応。
- カテゴリ削除は支出で未使用の場合のみ可能。使用中カテゴリの統合や一括付け替えは未対応。
- 店舗別カテゴリルールは店舗名の正規化一致、部分一致、共通ブランド接頭辞に基づくため、商品名やチェーン公式IDによる厳密な店舗識別は未対応。
- Google Vision利用にはProxy運用、Google Cloud認証情報管理、API課金、CORS制御、将来のレート制限が必要。
- Google Vision Proxyのhousehold membership確認には、Cloud Run実行サービスアカウントのFirestore読み取り権限と `REQUIRE_HOUSEHOLD_MEMBERSHIP=true` の維持が必要。
- 支出の更新・削除は競合検知に対応したが、差分表示や自動マージは未対応。
- Google Vision Proxyは短時間・月間制限に対応した。追加防御として `OCR_SHARED_TOKEN` と監査方針は未導入。
- Google Vision Proxyの `firebase-admin` 導入により、`uuid` transitive dependencyのmoderate audit警告が残る。`npm audit fix --force` は破壊的なFirebase Admin downgradeになるため未適用。
- 店舗候補抽出はブランド行と支店行の結合に対応したが、店舗ごとの例外ルールや誤候補抑制UIは未実装。
- 店舗別カテゴリルールはカテゴリ変更と削除に対応したが、店舗名そのものの編集は削除して再追加する必要がある。
- PWAの新しい配信は更新バナーで通知する。未保存入力を失わないため自動再読み込みは行わず、利用者が更新を実行する必要がある。
- Tesseract.js、端末内OCR、範囲比較、画像前処理、範囲調整コンポーネントはGoogle Vision固定化に伴い削除済み。旧バックアップの `lastOcrCrop` は互換読み込みのみ残る。

- ブラウザのプライベートモード、サイトデータ削除、端末容量不足により、要確認Inbox、匿名品質集計、未移行の旧ローカルデータが削除される可能性は残る。確定済み支出の正本はFirestoreにある。
- JSONバックアップは支出、カテゴリ、設定のみ対象。レシート画像Blobは容量が大きくなるため対象外。

- レシート候補抽出はヒューリスティックで、店舗ごとの精密な解析は未対応。
- `receiptParser.ts` は複数形式の規則が集中しており、POS形式別プロファイルと解析段階ごとの分割は未実装。
- 共有品質コーパスは12件で、家族が実際に利用するPOS形式の種類とOCR崩れをまだ十分には網羅していない。
- IndexedDB schema migrationはversion 1から2への追加移行だけ。今後store変更時は連続upgradeの回帰テストが必要。
- Rechartsの個別チャンクは大きめのため、major updateと合わせてbundle構成を見直す。
- レシート画像容量は警告のみで、圧縮やリサイズは未対応。
- 店舗名の補正は限定的なヒューリスティックで、店舗網羅は未対応。
- 自動カテゴライズは店舗名の正規化一致のみで、商品名や明細内容は考慮していない。
- 複数レシートの一括登録は失敗画像だけ再試行できるが、Google Visionへの送信は逐次処理のため枚数が多い場合は待ち時間が長くなる。
- Browser Smoke CIは未ログインのChromiumを対象とし、実Googleログイン、owner/member切り替え、外部OCR応答は実機・統合確認が必要。

## Next Recommended Priorities

- `receipt-confidence-v5` の小計差分補完・曖昧対応・品目不一致件数を家族端末で確認し、誤Highがないことと要確認率を評価する
- `receiptParser.ts` の正規化、領域分類、行対応、整合性判定の境界を定義し、最初のPOS形式プロファイルを食品スーパー形式で作る
- 家族の利用頻度が高い新しいPOS形式やOCR崩れを匿名共有コーパスへ追加し、レイアウト別の品目完全一致率、適合率、再現率を維持する
- 未所属アカウントにhousehold作成が表示されず、招待参加だけが利用できることをPC・スマホで確認する
- 管理者と家族の別Googleアカウントで招待、参加、支出共有、member解除後の即時アクセス失効を確認する
- Firebase Authのアカウント喪失時にownerを復旧する運用手順と、家庭内のクラウド費用上限・停止手順を整備する
- 実アカウントで未ログイン、オフライン、再接続、権限解除からの復旧をPC・スマホで確認する
- ownerの旧IndexedDBデータ移行がクラウド保存成功前にローカルデータを失わないことを実機確認する
- 認証済みowner/memberを含むブラウザ統合テストの方式を検討し、クラウド必須ゲートの回帰範囲を広げる
- 管理者・家族の各端末で1か月分の判定ルール別自動登録率、要確認理由、Undo率、要確認時の総額修正率を確認する
- 匿名fixtureを蓄積し、誤った総額がHighにならないことを確認してからConfidence閾値を調整する
- `receipt-confidence-v5` の品目不一致、小計差分補完、曖昧対応の理由件数を確認し、不要な要確認がないか実レシートで評価する
- 単体の安全性確認後、複数枚を画像単位のHigh自動保存とLow確認キューへ拡張する

- Recharts 3移行とメインbundle分割を個別Pull Requestで検証する
- 別端末で店舗ルールの追加・変更・削除と、同じ支出の競合通知を実機確認する
- staging失敗率、production承認待ち時間、rollback所要時間を確認し、運用手順を調整する

- Firebase Hosting URLでのPC/スマホGoogleログイン継続確認
- Cloud Run実行サービスアカウントのFirestore読み取り権限を確認し、家族アカウントでレシート読み取りを実機確認する
- Google Sheets一方向出力を実スプレッドシートで確認し、列構成と表示形式を調整する
- 新しい店舗形式で誤分類が見つかった場合は、OCR結果を匿名化して品目抽出回帰テストへ追加する。
- 複数品目の実レシートで、座標を使った商品名・金額対応付けを確認する。
- Google Visionの月間上限を実利用量に合わせて定期確認し、必要なら `OCR_MONTHLY_LIMIT` を調整する。
- 店舗別カテゴリルールの実機利用結果を確認し、支店違いの誤適用や解除しやすさを調整する。
- Google Vision固定後の失敗率、月間利用量、手入力への移行率を確認する。

- レシート画像の任意圧縮、リサイズ方針の検討
- 自動カテゴライズのルール確認、編集UIの検討
- 複数レシート登録の実機確認と、処理中に画面を閉じた場合の復元要否検討
