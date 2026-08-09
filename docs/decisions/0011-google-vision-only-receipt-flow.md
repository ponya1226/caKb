# ADR 0011: Google Vision固定のレシート読み取り導線

## Status

Accepted

## Context

ADR 0003ではGoogle VisionとTesseract.jsを選択可能なOCR Providerとして導入した。その後の実レシート検証では、Google Visionの文字認識と座標情報が、店舗名、総額、品目明細の抽出に必要な精度を安定して提供した。一方、利用者向け画面に読み取り方式、範囲、画像補正を並べると、通常の登録に不要な判断と操作が増える。

クラウド家計簿では、Googleログインとactive household membershipをGoogle Vision Proxyで確認できる。利用者が日常的に使う経路を1つに絞り、失敗時は再試行または手入力へ案内する方が、現在の運用と整合する。

## Decision

- 利用者向けのレシート読み取りはGoogle Visionに固定する。
- レシート画像全体を既定の読み取り範囲とし、Provider選択、範囲調整、画像補正の操作を利用画面から外す。
- レシート登録は「撮影またはアップロード」「読み取る」「結果を確認・修正」「保存」の流れに統一する。
- Google Visionを利用できない場合は、ログイン、再試行、手入力のいずれかを案内する。Tesseract.jsへの自動または手動フォールバックは利用画面へ出さない。
- 利用画面から参照されなくなるTesseract.js、`localTesseract` Provider、範囲比較、画像前処理、範囲調整コンポーネントを削除する。
- 旧バックアップを読み込めるよう、`AppSettings.lastOcrCrop` の互換読み込みだけは維持する。支出、IndexedDB、Firestoreの保存schemaは変更しない。
- OCR後は従来どおり `receiptParser.ts` を通し、保存前に必ず利用者が確認・修正する。

## Security and Privacy

- 画像送信前の画面で、Googleの文字読み取りサービスへ画像を送信することを明示する。
- フロントエンドからGoogle Vision APIを直接呼ばず、自前Proxyを利用する。
- ProxyはFirebase ID tokenとactive household membershipを検証する。
- Proxyは画像、画像base64、OCR全文をログへ出さず、画像を永続保存しない。
- API課金と利用量超過に備え、短時間制限と月間上限を維持する。

## Consequences

- 通常の利用者は読み取り方式や画像補正を判断せずに登録できる。
- 端末内だけで完結するレシート読み取りと、オフラインでのレシート読み取りは利用できなくなる。手入力と既存データの閲覧は引き続き利用できる。
- Google Cloud、ネットワーク、Proxy、認証の障害時はレシート読み取りが利用できない。
- Tesseract.jsの依存と旧OCR調整コードがなくなり、保守対象と供給網リスクが減る。

## Alternatives Considered

- Provider選択を残す: 障害時の代替になるが、精度差が大きく利用者の選択負担が残る。
- Google Vision失敗時だけ自動でTesseract.jsを実行する: 外部送信後に長い端末処理が始まり、結果品質と待ち時間を予測しにくい。
- Tesseract.jsを一時的に残す: ロールバック余地は増えるが、利用されない依存と旧ロジックを保守し続けるため採用しない。

## Follow-up

- 実機で単体・複数レシートの登録、再試行、未ログイン案内を確認する。
- Google Vision固定後の利用状況、失敗率、月間利用量を確認する。
- 管理者向け設定は一般利用者の画面へ表示せず、ownerだけが開ける管理者メニューに集約する。
