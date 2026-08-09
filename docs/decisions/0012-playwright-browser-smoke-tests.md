# ADR 0012: Playwrightによる利用者画面のブラウザ回帰テスト

## Status

Accepted

## Context

caKbはスマホ利用を前提とし、アカウント、レシート登録、手入力登録を主要動線としている。これまではTypeScriptとVitestでロジックを検証し、画面全体は実機または手動ブラウザ確認に依存していた。管理者機能の非表示やGoogle Vision固定化のような画面整理は、DOM、遅延読み込み、IndexedDBを含む実ブラウザでの回帰テストが必要になる。

Googleログインは外部ポップアップと実アカウントを必要とするため、Pull Requestごとに実行する自動テストへ認証情報を持ち込まない構成が必要である。

## Decision

- Playwrightを開発依存として追加し、Chromiumのスマホviewportで主要動線を検証する。
- Pull Request CIではproduction buildをVite previewで配信し、未ログイン状態で次を確認する。
  - アカウント画面の一般利用者向け表示
  - Googleの文字読み取りに固定されたレシート登録画面
  - 旧OCR方式、範囲、画像補正UIが表示されないこと
  - IndexedDBへ手入力支出を保存し、一覧へ反映できること
  - 主要画面に横方向のoverflowがないこと
- テスト失敗時はPlaywrightのHTML report、screenshot、traceを短期間のCI artifactとして保存する。
- Googleログイン、owner/memberの実アカウント切り替え、外部OCR送信はbrowser smoke testの対象外とする。権限ロジックは単体テスト、実認証は別アカウントの実機確認で検証する。
- 実レシート、実メールアドレス、Firebase credentialをテストデータへ含めない。

## Consequences

- 利用者向け主要動線の表示崩れと不要機能の再混入をPull Requestで検出できる。
- Chromiumのインストールとproduction buildによりCI時間が増える。
- Google認証、Firestoreの複数利用者共有、実際のGoogle Vision応答は引き続き統合・実機確認が必要になる。

## Alternatives Considered

- 手動確認だけを継続する: 実機品質は確認できるが、Pull Requestごとの回帰を安定して検出できない。
- DOMを模したcomponent testだけを追加する: 高速だが、遅延読み込み、IndexedDB、実レイアウトをまとめて確認できない。
- CIで実Googleアカウントへログインする: credential管理、追加認証、アカウント停止リスクがあり採用しない。

## Follow-up

- owner/memberの別アカウントで招待、参加、支出共有、解除を実機確認する。
- 安定運用後に支出編集・削除とOCR確認画面のfixtureベーステストを追加する。
- staging環境を追加する場合は、デプロイ後の同じsmoke testを再利用する。
