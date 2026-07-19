# Project Status

Last Updated: 2026-07-20

## Implemented

- 店舗別カテゴリルールのFirestore正本化と家族間リアルタイム共有。未ログイン時はlocalStorageを継続利用
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
- `main` push時のRulesテスト、Firestore Rules配布、Firebase Hostingデプロイ

- Firestore cloud repositoryへの正本切替: ログイン済みかつクラウド家計簿が存在する場合、支出・カテゴリ・JSONインポート・データ初期化はFirestoreを保存先として使用
- IndexedDB local repositoryは未ログイン時、Firebase未設定時、クラウド家計簿未作成時のフォールバックとして継続
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
- GitHub Pages deploy workflowを通常push対象から外し、Firebase Hostingを正規確認URLに整理
- 今後の開発方針を `docs/development-roadmap.md` に整理
- ログイン成功時の `users/{uid}` profile作成/更新
- Firestore上のhousehold作成とowner member作成
- IndexedDB内の支出、カテゴリ、店舗別カテゴリルールをFirestoreへ手動コピーする移行UI
- OCR候補ボタンの選択中表示
- Google Vision OCRが設定済みの場合の高精度OCR優先導線
- 支店名が異なる同系列店舗に対するカテゴリ推定
- 店舗別カテゴリルールのlocalStorage保存、OCR確認画面での保存導線、設定画面での追加・カテゴリ変更・削除
- 店舗別カテゴリルールを保存済み支出履歴より優先するカテゴリ初期値反映
- 店舗別カテゴリルールを含むJSONバックアップ/復元
- Google Vision OCR ProviderのPhase 1追加
- OCR Provider抽象化: localTesseract / googleVision
- Google Vision Proxy呼び出しクライアント
- Google Vision Proxyサンプル実装
- Google Vision ProxyのCloud Run向けDockerfileとproduction start script
- Google Vision ProxyのFirebase ID token検証
- Google Vision Proxyのactive household membership制限
- フロントエンドからGoogle Vision ProxyへのFirebase ID token送信
- 未ログイン時の高精度OCR利用制限とローカルOCR導線
- GitHub Pages build時の `VITE_GOOGLE_VISION_PROXY_URL` Repository variable連携
- Google Vision ProxyのCloud Run疎通確認手順
- レシート登録画面のOCR方式選択と外部送信注意表示
- OCR確認画面の読み取り方式表示
- Google Vision OCR結果向けの店舗候補抽出調整: ブランド行と支店行の結合候補
- Google Vision OCR結果向けの金額候補抽出調整: 合計、預かり金、お釣りの優先順位
- 保存済み店舗カテゴリ推定の店舗名揺れ対応
- PWA service workerのnetwork-first化による古いchunk参照対策
- React ErrorBoundaryによる白画面停止時の再読み込み導線

- ダッシュボードの対象月選択と過去月集計表示
- IndexedDB保存状態、永続保存許可、概算使用量、支出件数、保存期間の設定画面表示
- Storage Persistence APIによる永続保存リクエスト
- JSONバックアップとJSON復元

- OCR範囲を画像上で直接移動・端調整できるプレビューUI
- OCR範囲のスライダー、プリセット、自動範囲設定の折りたたみ表示
- 手動OCR範囲調整時の補正ありOCR適用
- 複数選択OCRの画像ごとのOCR範囲保持とサムネイル切り替え
- 画像選択後の用紙または文字領域自動検出とOCR範囲プレビュー反映
- 長い下部領域を含むレシートで会計本体を優先する自動検出範囲調整
- 現在のOCR範囲を全画像に適用する補助操作
- OCR前処理の高コントラスト、二値化、太字化候補比較
- OCRに渡した補正後画像の折りたたみ確認UI
- 通貨記号付き金額とOCR崩れした1,000円表記の候補抽出改善

- OCR前処理プリセット: 文字領域の自動寄せ、拡大、グレースケール化、コントラスト補正、二値化、太字化を通常OCR候補と比較
- OCR前処理の白紙領域検出、Tesseractページ分割設定、長すぎるノイズ結果のスコア抑制
- 単体OCRと複数枚OCRで同じ自動候補セットを使う安定化

- Vite + React + TypeScriptのPWA土台
- IndexedDB保存
- 初期カテゴリseed
- 支出の手入力登録、編集、削除
- レシート画像アップロード、カメラ撮影入力
- Tesseract.js OCR実行
- OCR全文表示
- 日付、店舗名、金額候補抽出
- OCR確認画面での修正保存
- ダッシュボードの月次合計、前月比、カテゴリ別支出、日別推移
- CSVエクスポート
- データ初期化
- レシート画像保存ON/OFF
- 画面単位の遅延読み込み
- 支出一覧の店舗名、メモ、カテゴリ名検索
- 支出一覧のカテゴリフィルタ
- レシート画像の容量表示と5MB超のOCR時間注意表示
- OCR候補抽出の主要パターンに対するテスト拡充
- OCR結果全文のコピー
- OCR対象範囲の手動指定
- 実レシートOCRノイズに対する日付、店舗名、金額候補抽出の改善
- GitHub Pagesへの静的デプロイworkflow
- ノイズの強いOCRヘッダー行を店舗候補から除外
- 保存済み店舗名に基づくレシートカテゴリの自動初期値反映
- 複数レシート画像の一括OCRと1枚ずつの確認保存キュー
- ダッシュボードのレシート登録分合計、件数表示
- 複数OCR範囲プリセットの自動比較
- 前回OCR範囲のlocalStorage保存
- OCR範囲プリセットの追加と既定範囲保存UI
- 複数レシート確認中の1枚単位再OCR

## Not Started

- Google Sheets一方向同期
- AI分析
- 予算管理
- 定期支出

## Technical Debt

- 品目明細は支出の付加情報として保存しており、品目別カテゴリ集計、品目別自動カテゴライズ、数量/単価、商品マスタ、Google Sheets品目別出力は未対応
- ログイン済みかつクラウド家計簿がある場合の支出データ正本はFirestore。未ログイン時やクラウド家計簿未作成時はIndexedDBへフォールバックするため、保存先表示と移行手順の継続的な分かりやすさ改善が必要。
- Firebase Hosting deploy workflowは `main` pushで自動実行される。GitHub Secret `FIREBASE_SERVICE_ACCOUNT_CAKB_DEV` の継続管理が必要。
- GitHub Pagesは通常push対象から外したが、workflow自体は手動実行用に残っている。公開URL案内やGitHub Pages設定の整理は残る。
- Firestore Rulesの基本的なmember/非member/owner権限はEmulatorテスト済み。招待機能追加時は招待コードとmember作成条件のテスト拡充が必要。
- Google Sheets同期は方針のみで、Sheets API連携、認可、同期ログ、失敗時再試行は未実装。
- カテゴリ削除は支出で未使用の場合のみ可能。使用中カテゴリの統合や一括付け替えは未対応。
- 店舗別カテゴリルールは店舗名の正規化一致、部分一致、共通ブランド接頭辞に基づくため、商品名やチェーン公式IDによる厳密な店舗識別は未対応。
- Google Vision利用にはProxy運用、Google Cloud認証情報管理、API課金、CORS制御、将来のレート制限が必要。
- Google Vision Proxyのhousehold membership確認には、Cloud Run実行サービスアカウントのFirestore読み取り権限と `REQUIRE_HOUSEHOLD_MEMBERSHIP=true` の維持が必要。
- 支出の更新・削除は競合検知に対応したが、差分表示や自動マージは未対応。
- Google Vision ProxyはCloud Runデプロイ可能な形にしたが、追加防御として `OCR_SHARED_TOKEN`、リクエスト制限、監査方針を追加検討する必要がある。
- Google Vision Proxyの `firebase-admin` 導入により、`uuid` transitive dependencyのmoderate audit警告が残る。`npm audit fix --force` は破壊的なFirebase Admin downgradeになるため未適用。
- 店舗候補抽出はブランド行と支店行の結合に対応したが、店舗ごとの例外ルールや誤候補抑制UIは未実装。
- 店舗別カテゴリルールはカテゴリ変更と削除に対応したが、店舗名そのものの編集は削除して再追加する必要がある。
- PWA更新直後に既に開いている古い画面は、再読み込みが必要になる場合がある。

- ブラウザのプライベートモード、サイトデータ削除、端末容量不足によるIndexedDB削除はアプリだけでは完全に防げない。
- JSONバックアップは支出、カテゴリ、設定のみ対象。レシート画像Blobは容量が大きくなるため対象外。

- OCR前処理は白紙領域検出、文字領域検出、明度補正まで。傾き補正、台形補正、店舗・撮影条件別の最適化は未対応。
- 前回保存クロップは自動OCRでは使わず、手動プリセットとしてのみ利用する。

- Tesseract.jsの言語データ取得はライブラリ標準挙動に依存している。
- レシート候補抽出はヒューリスティックで、店舗ごとの精密な解析は未対応。
- IndexedDB schema migrationはversion 1のみ。
- Tesseract.jsとRechartsの個別チャンクは大きめのため、必要に応じてさらに分割する。
- レシート画像容量は警告のみで、圧縮やリサイズは未対応。
- OCR範囲指定は矩形切り抜きのみで、傾き補正や台形補正は未対応。
- 店舗名の補正は限定的なヒューリスティックで、店舗網羅は未対応。
- Firebase Hosting移行後の公開URL案内はREADME上では整理済み。GitHub Pages設定の完全停止は未対応。
- 自動カテゴライズは店舗名の正規化一致のみで、商品名や明細内容は考慮していない。
- 複数レシートの一括登録は逐次OCRのため、枚数が多い場合は待ち時間が長くなる。
- 自動OCR範囲比較は複数回OCRするため、単発OCRより時間がかかる。
- OCR画像前処理は二値化と太字化まで。傾き補正や台形補正は未対応。
- 手動範囲調整は補正ありOCRを標準にしたため、補正なし比較は範囲プリセットから選ぶ必要がある。
- 自動検出範囲は長いレシートの下部を控えめに除外するため、下部に合計があるレシートでは手動調整が必要になる可能性がある。
- 確認画面での再OCRは現在の1枚のみを対象にし、複数枚全体の自動再最適化は未対応。

## Next Recommended Priorities

- 管理者と家族の別Googleアカウントを使い、招待、参加、支出共有、解除をスマホ実機で確認する
- 別端末で店舗ルールの追加・変更・削除と、同じ支出の競合通知を実機確認する

- 品目候補抽出の実レシート回帰テストを増やし、Google Vision OCR結果で商品行と小計/支払行の誤分類を継続調整する
- Firebase Hosting URLでのPC/スマホGoogleログイン継続確認
- GitHub Pages設定の完全停止またはアーカイブ方針決定
- Cloud Run実行サービスアカウントのFirestore読み取り権限を確認し、家族アカウントで高精度OCRを実機確認する
- Google Sheets一方向同期の設定UIとエクスポートProxy
- 高精度OCRの実レシート結果を匿名化し、候補抽出の回帰テストへ追加する。
- 追加防御として `OCR_SHARED_TOKEN` またはCloud Run側の利用制限方式を検討する。
- 店舗別カテゴリルールの実機利用結果を確認し、支店違いの誤適用や解除しやすさを調整する。
- OCR前処理プリセットの実機結果を比較し、店舗・撮影条件ごとの閾値を調整する。

- 支出日の範囲指定や金額範囲での絞り込み
- レシート画像の任意圧縮、リサイズ方針の検討
- OCR範囲指定と画像ごと切り替えの実機操作性改善
- 自動カテゴライズのルール確認、編集UIの検討
- 複数レシート登録時の失敗画像再試行や処理待ち表示の改善
- OCR画像前処理の追加検証
