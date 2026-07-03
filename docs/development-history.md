# Development History

## 2026-07-03 Online Verification Step

目的: ローカル開発サーバーではなく、オンラインURLでMVPを確認できるようにする。

主な変更:

- `main` push時にlint、test、build、Pages deployを行うGitHub Actions workflowを追加
- Vite build asset path、PWA manifest、favicon、service worker登録をGitHub Pagesの `/caKb/` サブパスでも動くように調整
- 静的GitHub Pages公開のADRを追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

残課題:

- 初回公開後、GitHub ActionsとPages設定の状態確認が必要
- 公開URLで保存したデータは、そのURLを開いたブラウザ内のIndexedDB/localStorageに保存される

## 2026-07-02 OCR Candidate Tuning Step

目的: 実機OCR結果で主要情報は読めているが文字崩れが残る状態に対して、候補抽出側で日付、店舗名、金額を拾いやすくする。

主な変更:

- 匿名化したOCR結果を回帰テストに追加
- 年表記の一部が欠けた日本語日付表記を候補化
- 崩れた支払行や金額表記から金額候補を優先
- 電話番号、登録番号、伝票番号、日付行を金額フォールバックから除外
- 崩れた店舗名表記を候補として補正
- 複数段階のOCR改善結果を、架空の店舗、住所、番号、商品、金額に置き換えて回帰テスト化

検証:

- `npm run lint`
- `npm run test`

残課題:

- 店舗名補正は限定的なヒューリスティックで、店舗網羅は未対応
- OCR自体の読み取り精度は画像状態と範囲指定に依存する

## 2026-07-02 OCR Debug Step

目的: 実レシート検証でOCR結果のノイズが大きい問題に対して、無料・ローカル方針を維持したまま検証と修正をしやすくする。

主な変更:

- OCR結果全文をレシート登録画面とOCR確認画面からコピーできるように変更
- OCR対象範囲を上、下、左、右のスライダーで指定できるUIを追加
- 下部クーポンや左右背景を除外しやすい「本体」プリセットを追加
- 精度が悪化した自動クロップ、強い画像補正、Worker API切り替えは採用せず、基本のTesseract.js `recognize()` に戻した

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
- `git diff --check`

残課題:

- OCR範囲指定は矩形のみで、傾き補正や台形補正は未対応
- 実レシート画像ごとの精度差は残る

## 2026-07-02 Search Filter OCR Test Step

目的: 次フェーズとして、支出一覧の探索性、OCR候補抽出の検証、レシート画像選択時の容量確認を改善する。

主な変更:

- 支出一覧に店舗名、メモ、カテゴリ名を対象にした検索入力を追加
- 支出一覧に「すべて」を初期値とするカテゴリフィルタを追加
- 月別表示を維持し、検索条件とカテゴリフィルタをAND条件で適用
- 検索結果0件時の空状態メッセージを追加
- レシート登録画面に選択画像のファイルサイズ表示を追加
- 5MB超の画像にOCR時間の注意表示を追加
- OCR候補抽出テストを9件に拡充

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

残課題:

- レシート画像の圧縮、リサイズは未実装
- 検索条件のURL query化や永続化は未実装

## 2026-07-02 Performance Step

目的: 初期表示のバンドル負荷を下げる。

主な変更:

- 主要画面を `React.lazy` と `Suspense` で遅延読み込み化
- Tesseract.jsを含むレシート登録画面を、レシート画面表示時まで分離
- Rechartsを含むダッシュボードを画面チャンクへ分離
- 画面読み込み中の表示を追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`

## 2026-07-02

目的: 家計簿PWAのMVPを新規作成する。

主な変更:

- React + TypeScript + Viteの新規構成を追加
- IndexedDB repositoryと初期カテゴリseedを追加
- ダッシュボード、支出一覧、レシート登録、OCR確認、設定画面を追加
- Tesseract.js OCRと候補抽出を追加
- CSVエクスポート、データ初期化、PWA manifest/service workerを追加
- 初期開発ドキュメント、ADR、規約を追加

検証:

- `npm run lint`
- `npm run test`
- `npm run build`
