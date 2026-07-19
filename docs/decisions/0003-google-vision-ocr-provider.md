# ADR 0003: Google Vision OCR Provider

## Status

Accepted

## Context

Tesseract.jsによるブラウザ内OCRは無料かつローカル実行できる一方、実レシートでは店舗、印字、撮影条件により読み取り精度が不足している。特に金額や店舗名が欠けるケースがあり、家計簿入力の負担が残っている。

## Decision

Google Cloud Vision OCRを高精度OCR Providerとして追加する。既存のTesseract.js OCRは削除せず、`localTesseract` Providerとしてフォールバックに残す。

OCR Providerは次の流れに統一する。

```text
OCR Provider
  -> OCR全文
  -> receiptParser.ts
  -> OCR確認画面
  -> IndexedDB保存
```

Google Vision利用時も、OCR結果は必ず確認画面でユーザーが修正してから保存する。

## Consequences

- Google Vision利用時は、レシート画像を外部サービスへ送信する。
- Google Vision API利用により課金が発生する可能性がある。
- 課金リスクを抑えるため、ProxyでUID単位の短時間制限とFirestore上のプロジェクト月間上限を適用する。月間カウンタには件数と期間だけを保存する。
- フロントエンドからGoogle Vision APIを直接呼ばず、自前ProxyへPOSTする。
- APIキー、service account key、token、secretはフロントエンドやリポジトリへ置かない。
- Proxyは画像やOCR全文をログ出力せず、サーバーに永続保存しない。
- Firebase Hosting移行後は、ProxyでFirebase ID tokenを検証し、未ログイン利用を拒否する。
- IndexedDB schemaは変更しない。OCR Provider情報は確認画面のドラフト状態で扱う。

## Alternatives Considered

- Tesseract.js改善継続: ローカル完結を維持できるが、実レシート精度の上限が見え始めている。
- iOS Live Text貼り付け: 端末依存が強く、一括登録や統一UXに向かない。
- Document AI Expense Parser: レシート特化の解析に期待できるが、導入・コスト・検証負荷が大きいため、まずGoogle Visionで効果を検証する。

## Follow-up

Google Visionの実機結果、費用、運用負荷を確認し、必要に応じてDocument AI Expense Parserとの比較を行う。Proxyには将来、レート制限、月間上限、追加の利用回数制限を追加できるようにする。
