# ADR 0007: Firebase Hostingへ移行して認証を安定化する

- Status: Accepted
- Date: 2026-07-07

## Context

GitHub Pages上ではPCのGoogleログインは動作したが、スマホではログイン復帰後に未ログインのままになる事象が発生した。Firebase Authenticationのredirect認証は、Firebase Hosting以外のホストではブラウザのサードパーティストレージ制限の影響を受ける場合がある。

caKbは今後、家族共有、Firestore正本化、Google Sheets同期へ進むため、認証を早めに安定させる必要がある。

## Decision

- 配信基盤をGitHub PagesからFirebase Hostingへ移行する。
- 初期の正規URLは `https://cakb-dev.firebaseapp.com` とする。
- Firebase Hosting上のスマホ/PWAではGoogleログインをredirect方式にする。
- GitHub PagesなどFirebase Auth domain外のホストではpopup方式を維持する。
- GitHub Pages workflowは移行完了まで残すが、Firebase Hosting検証後に停止する。
- Firebase Hosting deployはGitHub Actionsから手動実行できるようにし、service accountやtokenはGitHub Secretsで管理する。
- 支出データの正本は、Hosting移行直後はIndexedDBのまま維持し、次フェーズでFirestore正本へ切り替える。

## Consequences

- スマホのGoogleログイン復帰がFirebase Authの想定構成に近づく。
- Firebase Auth、Firestore、Hosting、Cloud Run Proxyを同じGoogle/Firebase基盤で運用できる。
- Firebase Hosting用のGitHub Secret設定とAuthorized domain確認が必要になる。
- GitHub Pages URLとFirebase Hosting URLではIndexedDB/localStorageが別扱いになるため、移行中はローカルデータのJSONバックアップやFirestoreコピーが重要になる。

## Security / Privacy

- Firebase client configは引き続き `VITE_FIREBASE_*` から読み取る。
- Firebase deploy用service account key、token、secretはrepoにコミットしない。
- Google Vision Proxyの認証強化は次フェーズでFirebase ID token検証を追加する。
- Firestore正本化までは、支出データの通常登録・一覧表示はIndexedDBを利用する。

## Alternatives

- GitHub Pages継続: 静的配信はできるが、スマホ認証の不安定さが残る。
- GitHub PagesでFirebase Auth helperをself-host/proxyする: 追加運用が必要で、Firebase Hostingへ寄せる方が単純。
- Vercel/Netlifyへ移行: 配信は安定するが、Firebase Auth/Firestore/Cloud Runとの基盤統一ではFirebase Hostingが自然。

## Verification

- Firebase Hosting URLでPC/スマホのGoogleログインとログイン状態保持を確認する。
- PWAとして追加した状態で再起動後もログイン状態が保持されることを確認する。
- `npm run lint`
- `npm run test`
- `npm run build`
