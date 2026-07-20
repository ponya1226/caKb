# ADR 0009: Google Sheets一方向エクスポート

Date: 2026-07-20

## Status

Accepted

## Context

家族が従来利用しているGoogleスプレッドシートでも支出を確認したい。一方、caKbではFirestoreを支出の正本としており、Sheets側編集の取り込みまで行うと競合解決、認可、変更履歴の設計が必要になる。

## Decision

- Google Sheets連携の初期版は、FirestoreからGoogle Sheetsへの手動一方向エクスポートとする。
- 1支出を1行で出力し、品目明細は同じ行の1セルへ要約する。品目ごとの行出力は行わない。
- 出力先は利用者が作成したスプレッドシート内の `caKb支出` タブに固定し、このタブだけを全件置換する。
- 実行できるのはactive householdのownerだけとする。ProxyはFirebase ID tokenを検証し、リクエストのhousehold IDは信用せず、`users/{uid}.activeHouseholdId` とmember roleから対象家計簿を決定する。
- Cloud Runの実行サービスアカウントを対象スプレッドシートへ編集者として直接共有する。サービスアカウント鍵、OAuth refresh token、APIキーは作成・保存しない。
- Cloud RunではApplication Default CredentialsとSheets APIの `spreadsheets` scopeを利用する。
- 出力成功時に `households/{householdId}/sheetSyncSettings/default` へスプレッドシートID、最終出力日時、件数を保存する。この設定はFirestore Rulesでownerだけが参照・変更できる。
- Sheetsへは `RAW` で値を書き込み、店舗名、メモ、品目名を数式として評価しない。
- 支出データやSheets API応答本文をProxyログへ出力しない。

## Consequences

- Firestoreが引き続き正本で、Sheets側の追加・変更・削除はcaKbへ反映されない。
- 再出力時は `caKb支出` タブをクリアして全件再作成するため、同タブへ手動で追記した内容は失われる。他のタブは変更しない。
- スプレッドシートには店舗名、金額、メモ、品目、登録者表示名などの家計情報が保存されるため、利用者が共有範囲を管理する必要がある。
- Google Sheets APIのクォータとサービス運用が必要になる。
- IndexedDBおよびExpenseの保存形式変更はない。

## Alternatives

- CSVを手動インポートする: バックエンド不要だが、更新のたびに利用者操作が増える。
- 利用者OAuthでSheetsへ書き込む: サービスアカウント共有は不要だが、追加scopeの同意画面、token管理、再認可が必要になる。
- Apps Script Web Appを使う: 実装は小さくできるが、公開URLの認可とデプロイ管理が別系統になる。
- 双方向同期: Sheets側変更の競合解決と検証が必要なため初期対象外とする。
