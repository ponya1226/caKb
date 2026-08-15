# ADR 0017: 月・判定ルール別の端末内品質レポート

## Status

Accepted

2026-08-11のADR 0018によりローカル家計簿モードを廃止したため、集計の消去権限はactive household ownerだけに限定する。

2026-08-15のADR 0020により、現在のConfidence判定ルールversionは `receipt-confidence-v2` へ更新された。本ADRで決定したversion別集計方式は変更しない。

## Context

ADR 0016で、自動登録率、要確認理由、Undo率、要確認時の総額修正率を、レシート内容を含まない月別カウンタとして端末内へ保存した。初期実装は当月だけを表示し、集計画面を管理者メニュー内に置いている。

このままでは、月が変わった後に前月の結果を確認しづらい。また、家族のmember端末では管理者メニューを表示しないため、その端末で蓄積した集計を確認できない。さらに、将来Confidence判定条件を変更した場合、新旧ルールの結果が同じ月別カウンタへ混ざり、変更前後を比較できない。

## Decision

- 端末内品質集計をstorage version 2へ更新し、月の下にConfidence判定ルールversion別カウンタを保持する。
- Confidence判定結果へ `policyVersion` を付与する。現在のversionは `receipt-confidence-v1` とする。
- storage version 1の月別カウンタは `legacy` policyとして読み込み、新しいevent記録時にversion 2へ移行する。
- 現在月と保存済みの過去月を選択して表示できるようにする。
- レシート内容を含まない月次レポートをクリップボードへコピーできるようにする。
- 自動登録状況は管理者メニューから分離し、アカウント画面の折りたたみ領域として全household memberが閲覧・コピーできるようにする。
- memberには集計の消去操作を提供しない。ownerまたは端末ローカル管理者だけが現在scopeの集計を消去できる。

## Data Model And Migration

新しい `localStorage` keyは `cakb-receipt-quality-metrics-v2` とする。

```text
version
scopes
  scopeKey
    months
      YYYY-MM
        policies
          policyVersion
            aggregate counters
```

旧key `cakb-receipt-quality-metrics-v1` は読み取り互換を維持する。version 2へ保存できた後に旧keyを削除する。壊れた値、未対応version、不正なpolicy名は空または `legacy` として安全側に処理し、レシート登録を失敗させない。

`Expense`、Firestore、IndexedDB、要確認Inbox、JSON、CSV、Google Sheetsのschemaは変更しない。既存の要確認データに `policyVersion` がない場合は `legacy` として集計する。

## UX

- 通常の撮影、自動保存、要確認、Undo操作は増やさない。
- 月選択、集計コピー、判定ルール別内訳は折りたたみの端末状況表示内だけに置く。
- memberへ家族管理、カテゴリ管理、バックアップ、データ消去などの管理機能を公開しない。
- コピー内容には対象月、件数、割合、理由コードの表示名、判定ルールversionだけを含める。

## Security And Privacy

- ADR 0016の保存禁止項目を維持する。
- コピー内容にhousehold ID、scope key、UID、メールアドレス、店舗名、日付、金額、品目、画像、OCR全文、支出IDを含めない。
- 集計は端末外へ自動送信しない。コピー後の共有は利用者の明示操作とする。
- policyVersionは実装上の判定ルール識別子であり、利用者や支出を識別する値にしない。

## Alternatives Considered

- 当月表示だけを維持する: 月跨ぎで比較できず、12か月保持の目的を満たさないため採用しない。
- familyの全端末集計をFirestoreへ送る: 横断集計は容易だが、同意、保持、削除、Rules、商用分析方針が未決定のため採用しない。
- memberへ管理者メニュー全体を表示する: owner/memberの権限分離を崩すため採用しない。
- app release SHA単位で集計する: 配信ごとに過度に分割されるため、意味のあるConfidence policy versionを明示的に管理する。

## Consequences

- 実績収集中に月が変わっても過去結果を確認できる。
- 家族は管理機能を使わず、自分の端末の集計だけを確認・コピーできる。
- 判定条件を将来変更しても、同月内で新旧結果を区別できる。
- storage version 1の結果は正確な判定versionを復元できないため `legacy` と表示される。
- 集計は引き続き端末単位であり、自動的な家族横断集計や厳密な監査ログにはならない。
