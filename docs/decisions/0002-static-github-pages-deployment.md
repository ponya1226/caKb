# 0002 Static GitHub Pages deployment

- Status: Accepted
- Date: 2026-07-03

## Context

実機確認用のローカル開発サーバーではなく、スマホからオンラインURLでMVPを確認したい。MVP方針として、バックエンド、ログイン、クラウド同期、外部DB、有料APIは追加しない。

## Decision

- GitHub Pagesで静的ビルドを公開する。
- GitHub Actionsで `main` へのpush時にlint、test、buildを実行し、`dist` をPagesへdeployする。
- Viteのbase pathは相対パス `./` にし、GitHub Pagesの `/caKb/` サブパス配信でも通常buildを使う。
- PWA manifestとservice workerはサブパス配信でも動くように相対/スコープ基準のURLを使う。

## Alternatives

- Vercel / Netlify: 静的公開としては有効だが、GitHub repositoryだけで完結するGitHub Pagesを優先する。
- ローカルトンネル: 一時確認には便利だが、URLが安定しにくく常設確認には向かない。

## Consequences

- オンラインURLでアプリを確認できる。
- アプリ本体は公開URLで配信されるが、支出データ、レシート画像、OCR全文は各ブラウザ内のIndexedDB/localStorageに保存される。
- URLが変わるとブラウザ内保存データも別扱いになる。
- GitHub Pagesの初回有効化やActionsの完了待ちが必要になる場合がある。

## Security / Privacy

バックエンドやクラウド同期は追加しない。OCRは引き続きブラウザ内でTesseract.jsを実行し、支出データ、レシート画像、OCR全文を外部DBへ送らない。

## Verification

- `npm run lint`
- `npm run test`
- `npm run build`
