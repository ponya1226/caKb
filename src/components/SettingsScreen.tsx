import { useEffect, useRef, useState } from "react";
import { Cloud, Copy, Database, Download, ExternalLink, FileJson, FileSpreadsheet, KeyRound, LogIn, LogOut, Plus, RefreshCw, Save, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Upload, UserMinus, UserPlus, Users } from "lucide-react";
import { buildBackupJson, downloadJson, parseBackupJson } from "../lib/backup";
import { buildExpensesCsv, downloadCsv } from "../lib/csv";
import { currentMonthKey, formatMonthLabel } from "../lib/date";
import { formatFileSize } from "../lib/format";
import { copyTextToClipboard } from "../lib/clipboard";
import type { BudgetStorageMode } from "../hooks/useBudgetData";
import type { CloudHouseholdState } from "../hooks/useCloudHousehold";
import type { FirebaseAuthState } from "../hooks/useFirebaseAuth";
import type { GoogleSheetsSyncState } from "../hooks/useGoogleSheetsSync";
import { buildGoogleSpreadsheetUrl, GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL } from "../lib/googleSheetsSync";
import { canManageBudgetSettings } from "../lib/settingsAccess";
import type { AppSettings, BackupImportMode, Category, CloudConnectionState, Expense, ShopCategoryRule, StorageHealth } from "../types";

type SettingsScreenProps = {
  expenses: Expense[];
  categories: Category[];
  settings: AppSettings;
  storageHealth: StorageHealth | null;
  onUpdateSettings: (settings: AppSettings) => void;
  onImportBackup: (backup: ReturnType<typeof parseBackupJson>, mode: BackupImportMode) => Promise<void>;
  onRequestPersistentStorage: () => Promise<boolean>;
  onRefreshStorageHealth: () => Promise<void>;
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
  storageMode: BudgetStorageMode;
  cloudConnection: CloudConnectionState | null;
};

type CategoryDraft = Pick<Category, "name" | "color">;

function formatOptionalFileSize(bytes: number | undefined): string {
  return typeof bytes === "number" ? formatFileSize(bytes) : "不明";
}

function formatMonthRange(storageHealth: StorageHealth | null): string {
  if (!storageHealth || storageHealth.monthCount === 0) {
    return "データなし";
  }

  if (storageHealth.oldestMonth === storageHealth.latestMonth && storageHealth.oldestMonth) {
    return formatMonthLabel(storageHealth.oldestMonth);
  }

  return `${storageHealth.oldestMonth ? formatMonthLabel(storageHealth.oldestMonth) : "不明"} - ${storageHealth.latestMonth ? formatMonthLabel(storageHealth.latestMonth) : "不明"}`;
}

function formatIndexedDbStatus(storageHealth: StorageHealth | null): string {
  if (!storageHealth) {
    return "未確認";
  }

  return storageHealth.indexedDbAvailable ? "利用可" : "利用不可";
}

function formatPersistentStorageStatus(storageHealth: StorageHealth | null): string {
  if (!storageHealth) {
    return "未確認";
  }

  if (!storageHealth.persistentStorageSupported) {
    return "非対応";
  }

  return storageHealth.persistentStorageGranted ? "有効" : "未許可";
}

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
  storageHealth,
  onUpdateSettings,
  onImportBackup,
  onRequestPersistentStorage,
  onRefreshStorageHealth,
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
  storageMode,
  cloudConnection,
}: SettingsScreenProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>("append");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newRuleShopName, setNewRuleShopName] = useState("");
  const [newRuleCategoryId, setNewRuleCategoryId] = useState(categories[0]?.id ?? "");
  const [newCategory, setNewCategory] = useState<CategoryDraft>({ name: "", color: "#0f766e" });
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [spreadsheetInput, setSpreadsheetInput] = useState("");
  const shopCategoryRules = settings.shopCategoryRules ?? [];
  const householdRole = cloudHousehold.household?.member.role ?? null;
  const isHouseholdOwner = householdRole === "owner";
  const canManageSettings = canManageBudgetSettings(storageMode === "cloud", householdRole);

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
    if (!newHouseholdName && firebaseAuth.user) {
      setNewHouseholdName(`${firebaseAuth.user.displayName}の家計簿`);
    }
  }, [firebaseAuth.user, newHouseholdName]);

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

  async function handleRequestPersistentStorage() {
    const granted = await onRequestPersistentStorage();
    setStatusMessage(granted ? "端末内データを消去されにくくしました" : "設定を変更できませんでした。ブラウザ設定を確認してください");
  }

  async function handleReset() {
    if (!window.confirm("すべての支出データを初期化しますか？")) {
      return;
    }

    await onResetData();
    setStatusMessage("データを初期化しました");
  }

  async function handleCreateHousehold() {
    await cloudHousehold.createHousehold(newHouseholdName);
  }

  async function handleMigrateLocalData() {
    if (!window.confirm("この端末の支出、カテゴリ、店舗ごとのカテゴリ設定をクラウドへコピーします。実行しますか？")) {
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

  async function handleJoinHousehold() {
    await cloudHousehold.joinHousehold(inviteCode);
    setInviteCode("");
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
            <strong>{firebaseAuth.user ? firebaseAuth.user.displayName : firebaseAuth.isConfigured ? "未ログイン" : "ログイン機能を利用できません"}</strong>
            <span>
              {firebaseAuth.user
                ? firebaseAuth.user.email || "メールアドレス未設定"
                : firebaseAuth.isConfigured
                  ? "Googleでログインすると家族と共有できます"
                  : "現在のアプリではGoogleログインを利用できません"}
            </span>
          </div>
          {firebaseAuth.user ? (
            <button className="button button-secondary" type="button" onClick={() => void firebaseAuth.signOut()} disabled={firebaseAuth.isWorking}>
              <LogOut size={18} aria-hidden="true" />
              ログアウト
            </button>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void firebaseAuth.signInWithGoogle()}
              disabled={!firebaseAuth.isConfigured || firebaseAuth.isLoading || firebaseAuth.isWorking}
            >
              <LogIn size={18} aria-hidden="true" />
              Googleでログイン
            </button>
          )}
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
          {storageMode === "cloud"
            ? `利用中: ${cloudHousehold.household?.household.name ?? "家族の家計簿"} / 保存先: クラウド。支出、カテゴリ、読み込んだバックアップは家族で共有されます。`
            : firebaseAuth.user
              ? "Googleログイン中ですが、現在の保存先はこの端末です。家族の家計簿を作成または参加するとクラウド保存に切り替わります。"
              : "未ログインです。現在のデータはこの端末に保存されています。"}
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

        {!firebaseAuth.isConfigured ? (
          <div className="empty-state">クラウド機能は現在利用できません</div>
        ) : !firebaseAuth.user ? (
          <div className="empty-state">Googleログイン後に作成できます</div>
        ) : cloudHousehold.isLoading ? (
          <div className="empty-state">家族の家計簿を確認中</div>
        ) : cloudHousehold.household ? (
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
                  この端末のデータをコピー
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
        ) : (
          <div className="cloud-onboarding">
            <div className="cloud-form">
              <label className="field">
                <span>新しい家計簿を作成</span>
                <input
                  type="text"
                  value={newHouseholdName}
                  placeholder="例: わが家の家計簿"
                  onChange={(event) => setNewHouseholdName(event.target.value)}
                />
              </label>
              <button className="button button-secondary" type="button" onClick={handleCreateHousehold} disabled={cloudHousehold.isWorking}>
                <Plus size={18} aria-hidden="true" />
                作成
              </button>
            </div>
            <div className="cloud-join-form">
              <label className="field">
                <span>家族の家計簿へ参加</span>
                <input
                  type="text"
                  value={inviteCode}
                  maxLength={10}
                  autoCapitalize="characters"
                  placeholder="招待コード"
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                />
              </label>
              <button className="button button-secondary" type="button" onClick={handleJoinHousehold} disabled={cloudHousehold.isWorking || !inviteCode.trim()}>
                <UserPlus size={18} aria-hidden="true" />
                参加
              </button>
            </div>
          </div>
        )}

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
            : "コピー済みのデータは重複しません。家族の家計簿がある場合、新しい支出やカテゴリはクラウドに保存されます。"}
        </p>
      </section>

      {canManageSettings && (
        <details className="admin-settings-panel">
          <summary>
            <span>
              <strong>{isHouseholdOwner ? "管理者メニュー" : "この端末のデータ管理"}</strong>
              <small>{isHouseholdOwner ? "家族、カテゴリ、書き出しを管理" : "カテゴリ、バックアップ、保存を管理"}</small>
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
          <h2>保存状態</h2>
          <button className="icon-button small" type="button" onClick={onRefreshStorageHealth} aria-label="保存状態を更新">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="status-grid">
          <div className="status-card">
            {storageMode === "cloud" ? <Cloud size={20} aria-hidden="true" /> : <Database size={20} aria-hidden="true" />}
            <span>現在の保存先</span>
            <strong>{storageMode === "cloud" ? "クラウド" : `この端末（${formatIndexedDbStatus(storageHealth)}）`}</strong>
          </div>
          <div className="status-card">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>端末内データの保護</span>
            <strong>{formatPersistentStorageStatus(storageHealth)}</strong>
          </div>
          <div className="status-card">
            <span>支出件数</span>
            <strong>{storageHealth?.expenseCount ?? expenses.length}件</strong>
          </div>
          <div className="status-card">
            <span>保存期間</span>
            <strong>{formatMonthRange(storageHealth)}</strong>
          </div>
          <div className="status-card">
            <span>使用量</span>
            <strong>{formatOptionalFileSize(storageHealth?.usageBytes)}</strong>
          </div>
          <div className="status-card">
            <span>保存できる目安</span>
            <strong>{formatOptionalFileSize(storageHealth?.quotaBytes)}</strong>
          </div>
        </div>

        <p className="subtle-text storage-note">
          {storageMode === "cloud"
            ? "支出とカテゴリはクラウドに保存され、同じ家計簿に参加している家族へ反映されます。"
            : "この端末のブラウザに保存されます。プライベートブラウズ、サイトデータ削除、端末容量不足では消える場合があります。"}
        </p>

        {!storageHealth?.persistentStorageGranted && storageHealth?.persistentStorageSupported && (
          <button className="button button-secondary full-width" type="button" onClick={handleRequestPersistentStorage}>
            端末内データを消去されにくくする
          </button>
        )}
      </section>

      <div className="settings-list">
        <article className="setting-row">
          <div>
            <strong>レシート画像保存</strong>
            <span>確定後も画像をこの端末に保存。要確認中の画像は設定にかかわらず最大7日間だけ一時保存されます。</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => onUpdateSettings({ ...settings, saveReceiptImages: !settings.saveReceiptImages })}
            aria-label="レシート画像保存を切り替え"
          >
            {settings.saveReceiptImages ? <ToggleRight size={28} aria-hidden="true" /> : <ToggleLeft size={28} aria-hidden="true" />}
          </button>
        </article>
      </div>

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
