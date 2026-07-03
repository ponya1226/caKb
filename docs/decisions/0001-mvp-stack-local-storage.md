# 0001 MVP stack and local storage

- Status: Accepted
- Date: 2026-07-02

## Context

MVPは無料で個人利用でき、バックエンド、ログイン、外部DBを使わずにレシートOCRから支出を保存する必要がある。

## Decision

- React + TypeScript + Viteで構築する。
- 支出、カテゴリ、任意のレシート画像はIndexedDBに保存する。
- 設定はlocalStorageに保存する。
- OCRはTesseract.jsをブラウザ内で実行する。
- グラフはRechartsを使う。
- PWAはmanifestと手書きservice workerで始める。

## Alternatives

- Next.js: バックエンドなしMVPには過剰なため採用しない。
- Chart.js: React画面ではRechartsの方がコンポーネントとして扱いやすいため採用しない。
- vite-plugin-pwa: MVPでは手書きservice workerで十分なため採用しない。

## Consequences

- サーバー運用なしで動作する。
- OCR精度と速度は端末性能とTesseract.jsに依存する。
- 将来の同期機能追加時には保存抽象の見直しが必要になる。

## Security / Privacy

支出データとレシート画像はブラウザ内に保存し、外部DBへ送らない。レシート画像保存OFFの場合は画像Blobを保存しない。

## Verification

- `npm run lint`
- `npm run test`
- `npm run build`
