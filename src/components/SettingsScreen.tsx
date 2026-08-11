import { useEffect, useRef, useState } from "react";
import { Cloud, Copy, Download, ExternalLink, FileJson, FileSpreadsheet, KeyRound, LogOut, Plus, RefreshCw, Save, Trash2, Upload, UserMinus, UserPlus, Users } from "lucide-react";
import { buildBackupJson, downloadJson, parseBackupJson } from "../lib/backup";
import { buildExpensesCsv, downloadCsv } from "../lib/csv";
import { currentMonthKey } from "../lib/date";
import { copyTextToClipboard } from "../lib/clipboard";
import type { CloudHouseholdState } from "../hooks/useCloudHousehold";
import type { FirebaseAuthState } from "../hooks/useFirebaseAuth";
import type { GoogleSheetsSyncState } from "../hooks/useGoogleSheetsSync";
import type { ReceiptQualityMetricsState } from "../hooks/useReceiptQualityMetrics";
import { buildGoogleSpreadsheetUrl, GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL } from "../lib/googleSheetsSync";
import type { AppSettings, BackupImportMode, Category, CloudConnectionState, Expense, ShopCategoryRule } from "../types";
import { ReceiptQualityMetricsPanel } from "./ReceiptQualityMetricsPanel";

type SettingsScreenProps = {
  expenses: Expense[];
  categories: Category[];
  settings: AppSettings;
  onImportBackup: (backup: ReturnType<typeof parseBackupJson>, mode: BackupImportMode) => Promise<void>;
  onResetData: () => Promise<void>;
  onRefreshData: () => Promise<void>;
  onAddCategory: (values: Pick<Category, "name" | "color">) => Promise<void>;
  onUpdateCategory: (category: Category, values: Pick<Category, "name" | "color">) => Promise<void>;
  onDeleteCategory: (category: Category) => Promise<void>;
  onUpsertShopCategoryRule: (shopName: string, categoryId: string) => Promise<void>;
  onSaveShopCategoryRule: (rule: ShopCategoryRule) => Promise<void>;
  onDeleteShopCategoryRule: (rule: ShopCategoryRule) => Promise<void>;
  hasLocalShopCategoryRulesToMigrate: boolean;
  firebaseAuth: FirebaseAuthState;
  cloudHousehold: CloudHouseholdState;
  googleSheetsSync: GoogleSheetsSyncState;
  cloudConnection: CloudConnectionState | null;
  receiptQualityMetrics: ReceiptQualityMetricsState;
};

type CategoryDraft = Pick<Category, "name" | "color">;

function formatCloudDate(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SettingsScreen({
  expenses,
  categories,
  settings,
  onImportBackup,
  onResetData,
  onRefreshData,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onUpsertShopCategoryRule,
  onSaveShopCategoryRule,
  onDeleteShopCategoryRule,
  hasLocalShopCategoryRulesToMigrate,
  firebaseAuth,
  cloudHousehold,
  googleSheetsSync,
  cloudConnection,
  receiptQualityMetrics,
}: SettingsScreenProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>("append");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newRuleShopName, setNewRuleShopName] = useState("");
  const [newRuleCategoryId, setNewRuleCategoryId] = useState(categories[0]?.id ?? "");
  const [newCategory, setNewCategory] = useState<CategoryDraft>({ name: "", color: "#0f766e" });
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const shopCategoryRules = settings.shopCategoryRules ?? [];
  const householdRole = cloudHousehold.household?.member.role ?? null;
  const isHouseholdOwner = householdRole === "owner";
  const canManageSettings = isHouseholdOwner;

  useEffect(() => {
    if (!newRuleCategoryId && categories[0]) {
      setNewRuleCategoryId(categories[0].id);
    }
  }, [categories, newRuleCategoryId]);

  useEffect(() => {
    setCategoryDrafts(
      Object.fromEntries(categories.map((category) => [category.id, { name: category.name, color: category.color }])),
    );
  }, [categories]);

  useEffect(() => {
    if (googleSheetsSync.settings?.spreadsheetId) {
      setSpreadsheetInput(googleSheetsSync.settings.spreadsheetId);
    }
  }, [googleSheetsSync.settings?.spreadsheetId]);

  async function handleAddShopCategoryRule() {
    const categoryId = newRuleCategoryId || categories[0]?.id;
    if (!categoryId || !newRuleShopName.trim()) {
      setStatusMessage("店舗名とカテゴリを入力してください");
      return;
    }

    try {
      await onUpsertShopCategoryRule(newRuleShopName, categoryId);
      setNewRuleShopName("");
      setNewRuleCategoryId(categoryId);
      setStatusMessage("店舗別カテゴリルールを保存しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "店舗別カテゴリルールを保存できませんでした");
    }
  }

  async function handleUpdateRuleCategory(rule: ShopCategoryRule, categoryId: string) {
    try {
      await onSaveShopCategoryRule({
        ...rule,
        categoryId,
        updatedAt: new Date().toISOString(),
      });
      setStatusMessage("店舗別カテゴリルールを更新しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "店舗別カテゴリルールを更新できませんでした");
    }
  }

  async function handleDeleteRule(rule: ShopCategoryRule) {
    try {
      await onDeleteShopCategoryRule(rule);
      setStatusMessage("店舗別カテゴリルールを削除しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "店舗別カテゴリルールを削除できませんでした");
    }
  }

  async function handleAddCategory() {
    try {
      await onAddCategory(newCategory);
      setNewCategory({ name: "", color: "#0f766e" });
      setStatusMessage("カテゴリを追加しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "カテゴリを追加できませんでした");
    }
  }

  async function handleUpdateCategory(category: Category) {
    const draft = categoryDrafts[category.id];
    if (!draft) {
      return;
    }

    try {
      await onUpdateCategory(category, draft);
      setStatusMessage("カテゴリを更新しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "カテゴリを更新できませんでした");
    }
  }

  async function handleDeleteCategory(category: Category) {
    if (!window.confirm(`${category.name}を削除しますか？`)) {
      return;
    }

    try {
      await onDeleteCategory(category);
      setStatusMessage("カテゴリを削除しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "カテゴリを削除できませんでした");
    }
  }

  function handleExportCsv() {
    const csv = buildExpensesCsv(expenses, categories);
    downloadCsv(`kakeibo-expenses-${currentMonthKey()}.csv`, csv);
  }

  function handleExportJson() {
    const json = buildBackupJson(expenses, categories, settings);
    downloadJson(`kakeibo-backup-${currentMonthKey()}.json`, json);
  }

  function handleSelectImportFile(mode: BackupImportMode) {
    const message =
      mode === "replace"
        ? "現在の支出・カテゴリ・設定をバックアップ内容で置き換えます。実行しますか？"
        : "バックアップ内の支出・カテゴリ・設定を現在のデータに追加します。実行しますか？";

    if (!window.confirm(message)) {
      return;
    }

    setImportMode(mode);
    importInputRef.current?.click();
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const backup = parseBackupJson(await file.text());
      await onImportBackup(backup, importMode);
      setStatusMessage(importMode === "replace" ? "バックアップで置き換えました" : "バックアップを追加しました");
    } catch (unknownError) {
      setStatusMessage(unknownError instanceof Error ? unknownError.message : "バックアップの読み込みに失敗しました");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function handleReset() {
    if (!window.confirm("すべての支出データを初期化しますか？")) {
      return;
    }

    await onResetData();
    setStatusMessage("データを初期化しました");
  }

  async function handleMigrateLocalData() {
    if (!window.confirm("以前この端末に保存した支出、カテゴリ、店舗設定をクラウドへ移行します。実行しますか？")) {
      return;
    }

    await cloudHousehold.migrateLocalData();
    await onRefreshData();
  }

  async function handleCreateInvite() {
    await cloudHousehold.createInvite();
  }

  async function handleCopyInvite() {
    if (!cloudHousehold.invite) {
      return;
    }
    setStatusMessage(
      (await copyTextToClipboard(cloudHousehold.invite.code))
        ? "招待コードをコピーしました"
        : "招待コードをコピーできませんでした",
    );
  }

  async function handleRemoveMember(uid: string, displayName: string) {
    if (!window.confirm(`${displayName}を家計簿から解除しますか？`)) {
      return;
    }
    await cloudHousehold.removeMember(uid);
  }

  async function handleCopySheetsServiceAccount() {
    setStatusMessage(
      (await copyTextToClipboard(GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL))
        ? "共有先メールアドレスをコピーしました"
        : "共有先メールアドレスをコピーできませんでした",
    );
  }

  async function handleExportToGoogleSheets() {
    const result = await googleSheetsSync.exportExpenses(spreadsheetInput);
    if (result) {
      setSpreadsheetInput(result.spreadsheetId);
      setStatusMessage(`${result.exportedExpenses}件をGoogleスプレッドシートへ書き出しました`);
    }
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">ログインと家計簿</p>
          <h1>アカウント</h1>
        </div>
      </div>

      {statusMessage && <div className="inline-status">{statusMessage}</div>}

      <section className="content-section">
        <div className="section-title-row">
          <h2>アカウント</h2>
          <Cloud size={20} aria-hidden="true" />
        </div>

        <div className="account-panel">
          <div>
            <strong>{firebaseAuth.user?.displayName ?? "ログイン情報を確認中"}</strong>
            <span>{firebaseAuth.user?.email || "メールアドレス未設定"}</span>
          </div>
          <button className="button button-secondary" type="button" onClick={() => void firebaseAuth.signOut()} disabled={firebaseAuth.isWorking}>
            <LogOut size={18} aria-hidden="true" />
            ログアウト
          </button>
        </div>

        {firebaseAuth.error && (
          <div className="inline-error account-error">
            <p>{firebaseAuth.error}</p>
            <button className="button button-secondary button-compact" type="button" onClick={firebaseAuth.clearError}>
              閉じる
            </button>
          </div>
        )}

        <p className="subtle-text storage-note">
          利用中: {cloudHousehold.household?.household.name ?? "家族の家計簿"} / 支出、カテゴリ、読み込んだバックアップはクラウドで家族に共有されます。
        </p>
        {hasLocalShopCategoryRulesToMigrate && canManageSettings && (
          <p className="inline-notice">
            この端末だけに保存された店舗設定があります。端末のデータをクラウドへコピーすると家族で共有できます。
          </p>
        )}
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>家族の家計簿</h2>
        </div>

        {cloudHousehold.household ? (
          <>
            <div className="cloud-panel">
              <div>
                <strong>{cloudHousehold.household.household.name}</strong>
                <span>権限: {cloudHousehold.household.member.role === "owner" ? "管理者" : "メンバー"}</span>
                <span>保存先: クラウド</span>
                <span>
                  接続状態: {
                    cloudConnection?.status === "online"
                      ? "同期済み"
                      : cloudConnection?.status === "offline"
                        ? "オフライン"
                        : cloudConnection?.status === "permissionDenied"
                          ? "アクセス権なし"
                          : "再接続中"
                  }
                </span>
                {cloudConnection?.lastSuccessfulSyncAt && (
                  <span>最終同期: {formatCloudDate(cloudConnection.lastSuccessfulSyncAt)}</span>
                )}
              </div>
              {isHouseholdOwner && (
                <button className="button button-secondary" type="button" onClick={handleMigrateLocalData} disabled={cloudHousehold.isWorking}>
                  <Upload size={18} aria-hidden="true" />
                  以前の端末データを移行
                </button>
              )}
            </div>

            {isHouseholdOwner && (
              <div className="family-invite-panel">
                <div className="section-title-row compact-title-row">
                  <h3><UserPlus size={18} aria-hidden="true" />家族を招待</h3>
                </div>
                <p className="subtle-text">招待コードは発行から24時間、1人の参加に使用できます。</p>
                {cloudHousehold.invite ? (
                  <div className="invite-code-row">
                    <div>
                      <span>招待コード</span>
                      <strong>{cloudHousehold.invite.code}</strong>
                      <small>{formatCloudDate(cloudHousehold.invite.expiresAt)}まで</small>
                    </div>
                    <button className="icon-button" type="button" onClick={handleCopyInvite} aria-label="招待コードをコピー">
                      <Copy size={19} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button className="button button-secondary" type="button" onClick={handleCreateInvite} disabled={cloudHousehold.isWorking}>
                    <KeyRound size={18} aria-hidden="true" />
                    招待コードを発行
                  </button>
                )}
              </div>
            )}

            <div className="family-members-panel">
              <div className="section-title-row compact-title-row">
                <h3><Users size={18} aria-hidden="true" />参加メンバー</h3>
                <span>{cloudHousehold.members.length}人</span>
              </div>
              <div className="member-list">
                {cloudHousehold.members.map((member) => {
                  const memberName = member.displayName || (member.role === "owner" ? "管理者" : `メンバー ${member.uid.slice(0, 6)}`);
                  return (
                    <div className="member-row" key={member.uid}>
                      <div>
                        <strong>{memberName}</strong>
                        <span>{member.role === "owner" ? "管理者" : "メンバー"}</span>
                      </div>
                      {isHouseholdOwner && member.role !== "owner" && (
                        <button className="icon-button danger" type="button" onClick={() => void handleRemoveMember(member.uid, memberName)} aria-label={`${memberName}を解除`} disabled={cloudHousehold.isWorking}>
                          <UserMinus size={18} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : <div className="empty-state">家計簿へ再接続してください</div>}

        {cloudHousehold.lastMigration && isHouseholdOwner && (
          <div className="inline-status">
            クラウドへコピーしました: 支出{cloudHousehold.lastMigration.expenses}件、カテゴリ{cloudHousehold.lastMigration.categories}件、店舗設定{cloudHousehold.lastMigration.shopCategoryRules}件
            <p>最終コピー: {formatCloudDate(cloudHousehold.lastMigration.completedAt)}</p>
            {cloudHousehold.lastMigration.warnings?.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        {cloudHousehold.error && (
          <div className="inline-error account-error">
            <p>{cloudHousehold.error}</p>
            <button className="button button-secondary button-compact" type="button" onClick={cloudHousehold.clearError}>
              閉じる
            </button>
            <button className="button button-secondary button-compact" type="button" onClick={() => void cloudHousehold.refresh()} disabled={cloudHousehold.isLoading}>
              <RefreshCw size={16} aria-hidden="true" />
              再試行
            </button>
          </div>
        )}

        <p className="subtle-text storage-note">
          {cloudHousehold.household && !isHouseholdOwner
            ? "登録した支出は家族へ共有されます。家計簿の設定は管理者が行います。"
            : "以前の端末データは明示的に移行できます。移行が成功する前に端末側のデータは削除しません。"}
        </p>
      </section>

      <details className="admin-settings-panel device-quality-panel">
        <summary>
          <span>
            <strong>この端末の自動登録状況</strong>
            <small>{canManageSettings ? "月別結果を確認、コピー、消去" : "月別結果を確認、コピー"}</small>
          </span>
        </summary>
        <div className="admin-settings-content">
          <ReceiptQualityMetricsPanel
            selectedMonthKey={receiptQualityMetrics.selectedMonthKey}
            monthKeys={receiptQualityMetrics.monthKeys}
            summary={receiptQualityMetrics.summary}
            reportText={receiptQualityMetrics.reportText}
            error={receiptQualityMetrics.error}
            onMonthChange={receiptQualityMetrics.selectMonth}
            onClear={canManageSettings ? receiptQualityMetrics.clearMetrics : undefined}
          />
        </div>
      </details>

      {canManageSettings && (
        <details className="admin-settings-panel">
          <summary>
            <span>
              <strong>管理者メニュー</strong>
              <small>家族、カテゴリ、書き出しを管理</small>
            </span>
          </summary>
          <div className="admin-settings-content">
      {isHouseholdOwner && (
      <section className="content-section">
        <div className="section-title-row">
          <h2>Googleスプレッドシート</h2>
          <FileSpreadsheet size={20} aria-hidden="true" />
        </div>

        {!googleSheetsSync.isConfigured ? (
          <div className="empty-state">スプレッドシートへの書き出しは現在利用できません</div>
        ) : (
          <div className="sheet-sync-panel">
            <div className="privacy-note">
              <strong>データの書き出し</strong>
              <span>クラウドに保存した支出をGoogleスプレッドシートへ書き出します。スプレッドシート側の変更はcaKbへ反映されません。</span>
            </div>

            <div className="sheet-share-row">
              <div>
                <span>スプレッドシートの共有先</span>
                <strong>{GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL}</strong>
              </div>
              <button className="icon-button" type="button" onClick={() => void handleCopySheetsServiceAccount()} aria-label="共有先メールアドレスをコピー">
                <Copy size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="field">
              <span>スプレッドシートのURL</span>
              <input
                type="text"
                inputMode="url"
                value={spreadsheetInput}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                onChange={(event) => setSpreadsheetInput(event.target.value)}
              />
            </label>

            <button
              className="button button-primary full-width"
              type="button"
              onClick={() => void handleExportToGoogleSheets()}
              disabled={googleSheetsSync.isLoading || googleSheetsSync.isWorking || !spreadsheetInput.trim()}
            >
              <Upload size={18} aria-hidden="true" />
              {googleSheetsSync.isWorking ? "書き出し中" : "支出一覧を書き出す"}
            </button>

            {googleSheetsSync.settings?.lastSyncedAt && (
              <div className="sheet-sync-result">
                <div>
                  <strong>{googleSheetsSync.settings.lastExportedExpenseCount ?? 0}件を書き出し済み</strong>
                  <span>最終書き出し: {formatCloudDate(googleSheetsSync.settings.lastSyncedAt)}</span>
                </div>
                <a
                  className="icon-button"
                  href={buildGoogleSpreadsheetUrl(googleSheetsSync.settings.spreadsheetId)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="出力先スプレッドシートを開く"
                >
                  <ExternalLink size={18} aria-hidden="true" />
                </a>
              </div>
            )}

            {googleSheetsSync.error && (
              <div className="inline-error account-error">
                <p>{googleSheetsSync.error}</p>
                <button className="button button-secondary button-compact" type="button" onClick={googleSheetsSync.clearError}>
                  閉じる
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      <section className="content-section">
        <div className="section-title-row">
          <h2>カテゴリ管理</h2>
        </div>
        <p className="subtle-text">
          支出登録やレシート確認で使うカテゴリを追加、編集できます。支出で使われているカテゴリは削除できません。
        </p>

        <div className="category-form">
          <label className="field">
            <span>カテゴリ名</span>
            <input
              type="text"
              value={newCategory.name}
              placeholder="例: 趣味"
              onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field color-field">
            <span>色</span>
            <input
              type="color"
              value={newCategory.color}
              onChange={(event) => setNewCategory((current) => ({ ...current, color: event.target.value }))}
            />
          </label>
          <button className="button button-secondary" type="button" onClick={handleAddCategory}>
            <Plus size={18} aria-hidden="true" />
            追加
          </button>
        </div>

        <div className="category-list">
          {categories.map((category) => {
            const draft = categoryDrafts[category.id] ?? { name: category.name, color: category.color };
            return (
              <article className="category-row" key={category.id}>
                <label className="field">
                  <span>名前</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(event) =>
                      setCategoryDrafts((current) => ({
                        ...current,
                        [category.id]: { ...draft, name: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field color-field">
                  <span>色</span>
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(event) =>
                      setCategoryDrafts((current) => ({
                        ...current,
                        [category.id]: { ...draft, color: event.target.value },
                      }))
                    }
                  />
                </label>
                <div className="item-actions">
                  <button className="icon-button small" type="button" onClick={() => handleUpdateCategory(category)} aria-label={`${category.name}を保存`}>
                    <Save size={17} aria-hidden="true" />
                  </button>
                  <button className="icon-button small danger" type="button" onClick={() => handleDeleteCategory(category)} aria-label={`${category.name}を削除`}>
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>店舗別カテゴリルール</h2>
        </div>
        <p className="subtle-text">
          保存した店舗名に一致したレシートは、ここで指定したカテゴリを初期値にします。
        </p>

        <div className="rule-form">
          <label className="field">
            <span>店舗名</span>
            <input
              type="text"
              value={newRuleShopName}
              placeholder="例: サンプルストア"
              onChange={(event) => setNewRuleShopName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>カテゴリ</span>
            <select value={newRuleCategoryId} onChange={(event) => setNewRuleCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-secondary" type="button" onClick={() => void handleAddShopCategoryRule()}>
            <Plus size={18} aria-hidden="true" />
            追加
          </button>
        </div>

        {shopCategoryRules.length === 0 ? (
          <div className="empty-state">店舗別カテゴリルールはありません</div>
        ) : (
          <div className="rule-list">
            {shopCategoryRules.map((rule) => (
              <article className="rule-row" key={rule.id}>
                <div>
                  <strong>{rule.shopName}</strong>
                  <span>{rule.normalizedShopName}</span>
                </div>
                <select value={rule.categoryId} onChange={(event) => void handleUpdateRuleCategory(rule, event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger" type="button" onClick={() => void handleDeleteRule(rule)} aria-label={`${rule.shopName}のルールを削除`}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="settings-list">
        <button className="setting-action" type="button" onClick={handleExportCsv}>
          <Download size={20} aria-hidden="true" />
          表計算用ファイルを書き出す
        </button>

        <button className="setting-action" type="button" onClick={handleExportJson}>
          <FileJson size={20} aria-hidden="true" />
          バックアップを保存
        </button>

        <button className="setting-action" type="button" onClick={() => handleSelectImportFile("append")}>
          <Upload size={20} aria-hidden="true" />
          バックアップから追加
        </button>

        <button className="setting-action" type="button" onClick={() => handleSelectImportFile("replace")}>
          <Upload size={20} aria-hidden="true" />
          バックアップで置き換え
        </button>

        <button className="setting-action danger" type="button" onClick={handleReset}>
          <Trash2 size={20} aria-hidden="true" />
          データ初期化
        </button>

      </div>

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        aria-label="バックアップファイルを選択"
        onChange={(event) => handleImportFile(event.target.files?.[0])}
      />
          </div>
        </details>
      )}
    </section>
  );
}
