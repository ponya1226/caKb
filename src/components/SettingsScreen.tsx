import { useEffect, useRef, useState } from "react";
import { Cloud, Database, Download, FileJson, LogIn, LogOut, Plus, RefreshCw, Save, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Upload } from "lucide-react";
import { buildBackupJson, downloadJson, parseBackupJson } from "../lib/backup";
import { upsertShopCategoryRule } from "../lib/categorySuggestion";
import { buildExpensesCsv, downloadCsv } from "../lib/csv";
import { currentMonthKey, formatMonthLabel } from "../lib/date";
import { formatFileSize } from "../lib/format";
import type { CloudHouseholdState } from "../hooks/useCloudHousehold";
import type { FirebaseAuthState } from "../hooks/useFirebaseAuth";
import type { AppSettings, BackupImportMode, Category, Expense, StorageHealth } from "../types";

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
  onAddCategory: (values: Pick<Category, "name" | "color">) => Promise<void>;
  onUpdateCategory: (category: Category, values: Pick<Category, "name" | "color">) => Promise<void>;
  onDeleteCategory: (category: Category) => Promise<void>;
  firebaseAuth: FirebaseAuthState;
  cloudHousehold: CloudHouseholdState;
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
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  firebaseAuth,
  cloudHousehold,
}: SettingsScreenProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>("append");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newRuleShopName, setNewRuleShopName] = useState("");
  const [newRuleCategoryId, setNewRuleCategoryId] = useState(categories[0]?.id ?? "");
  const [newCategory, setNewCategory] = useState<CategoryDraft>({ name: "", color: "#0f766e" });
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const shopCategoryRules = settings.shopCategoryRules ?? [];

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

  function updateShopCategoryRules(nextRules: NonNullable<AppSettings["shopCategoryRules"]>) {
    const nextSettings: AppSettings = { ...settings };
    if (nextRules.length > 0) {
      nextSettings.shopCategoryRules = nextRules;
    } else {
      delete nextSettings.shopCategoryRules;
    }
    onUpdateSettings(nextSettings);
  }

  function handleAddShopCategoryRule() {
    const categoryId = newRuleCategoryId || categories[0]?.id;
    if (!categoryId || !newRuleShopName.trim()) {
      setStatusMessage("店舗名とカテゴリを入力してください");
      return;
    }

    updateShopCategoryRules(upsertShopCategoryRule(shopCategoryRules, newRuleShopName, categoryId));
    setNewRuleShopName("");
    setNewRuleCategoryId(categoryId);
    setStatusMessage("店舗別カテゴリルールを保存しました");
  }

  function handleUpdateRuleCategory(ruleId: string, categoryId: string) {
    updateShopCategoryRules(
      shopCategoryRules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              categoryId,
              updatedAt: new Date().toISOString(),
            }
          : rule,
      ),
    );
  }

  function handleDeleteRule(ruleId: string) {
    updateShopCategoryRules(shopCategoryRules.filter((rule) => rule.id !== ruleId));
    setStatusMessage("店舗別カテゴリルールを削除しました");
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
    setStatusMessage(granted ? "永続保存を有効にしました" : "永続保存を有効にできませんでした。ブラウザ設定を確認してください");
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
    if (!window.confirm("現在のIndexedDB内の支出、カテゴリ、店舗別カテゴリルールをFirestoreへコピーします。実行しますか？")) {
      return;
    }

    await cloudHousehold.migrateLocalData();
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Local</p>
          <h1>設定</h1>
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
            <strong>{firebaseAuth.user ? firebaseAuth.user.displayName : firebaseAuth.isConfigured ? "未ログイン" : "Firebase未設定"}</strong>
            <span>
              {firebaseAuth.user
                ? firebaseAuth.user.email || "メールアドレス未設定"
                : firebaseAuth.isConfigured
                  ? "Googleログインでクラウド化準備を開始できます"
                  : "Firebase環境変数を設定するとログイン機能を使えます"}
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
          現時点ではログインしても支出データの保存先はIndexedDBです。クラウド移行は下のクラウド家計簿から明示操作で実行できます。
        </p>
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>クラウド家計簿</h2>
        </div>

        {!firebaseAuth.isConfigured ? (
          <div className="empty-state">Firebase設定後に利用できます</div>
        ) : !firebaseAuth.user ? (
          <div className="empty-state">Googleログイン後に作成できます</div>
        ) : cloudHousehold.isLoading ? (
          <div className="empty-state">クラウド家計簿を確認中</div>
        ) : cloudHousehold.household ? (
          <div className="cloud-panel">
            <div>
              <strong>{cloudHousehold.household.household.name}</strong>
              <span>権限: {cloudHousehold.household.member.role === "owner" ? "管理者" : "メンバー"}</span>
            </div>
            <button className="button button-secondary" type="button" onClick={handleMigrateLocalData} disabled={cloudHousehold.isWorking}>
              <Upload size={18} aria-hidden="true" />
              ローカルデータを移行
            </button>
          </div>
        ) : (
          <div className="cloud-form">
            <label className="field">
              <span>家計簿名</span>
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
        )}

        {cloudHousehold.lastMigration && (
          <div className="inline-status">
            Firestoreへコピーしました: 支出{cloudHousehold.lastMigration.expenses}件、カテゴリ{cloudHousehold.lastMigration.categories}件、店舗ルール{cloudHousehold.lastMigration.shopCategoryRules}件
          </div>
        )}

        {cloudHousehold.error && (
          <div className="inline-error account-error">
            <p>{cloudHousehold.error}</p>
            <button className="button button-secondary button-compact" type="button" onClick={cloudHousehold.clearError}>
              閉じる
            </button>
          </div>
        )}

        <p className="subtle-text storage-note">
          移行はコピーのみです。移行後もこの画面の支出登録・一覧表示は、次ステップまでIndexedDBを使用します。
        </p>
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>保存状態</h2>
          <button className="icon-button small" type="button" onClick={onRefreshStorageHealth} aria-label="保存状態を更新">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="status-grid">
          <div className="status-card">
            <Database size={20} aria-hidden="true" />
            <span>IndexedDB</span>
            <strong>{formatIndexedDbStatus(storageHealth)}</strong>
          </div>
          <div className="status-card">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>永続保存</span>
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
            <span>推定上限</span>
            <strong>{formatOptionalFileSize(storageHealth?.quotaBytes)}</strong>
          </div>
        </div>

        <p className="subtle-text storage-note">
          同じブラウザ・同じURLではIndexedDBに保存されます。プライベートブラウズ、サイトデータ削除、端末容量不足では消える場合があります。
        </p>

        {!storageHealth?.persistentStorageGranted && storageHealth?.persistentStorageSupported && (
          <button className="button button-secondary full-width" type="button" onClick={handleRequestPersistentStorage}>
            永続保存をリクエスト
          </button>
        )}
      </section>

      <div className="settings-list">
        <article className="setting-row">
          <div>
            <strong>レシート画像保存</strong>
            <span>IndexedDBに画像Blobを保存</span>
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
          <button className="button button-secondary" type="button" onClick={handleAddShopCategoryRule}>
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
                <select value={rule.categoryId} onChange={(event) => handleUpdateRuleCategory(rule.id, event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger" type="button" onClick={() => handleDeleteRule(rule.id)} aria-label={`${rule.shopName}のルールを削除`}>
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
          CSVエクスポート
        </button>

        <button className="setting-action" type="button" onClick={handleExportJson}>
          <FileJson size={20} aria-hidden="true" />
          JSONバックアップ
        </button>

        <button className="setting-action" type="button" onClick={() => handleSelectImportFile("append")}>
          <Upload size={20} aria-hidden="true" />
          JSONから追加復元
        </button>

        <button className="setting-action" type="button" onClick={() => handleSelectImportFile("replace")}>
          <Upload size={20} aria-hidden="true" />
          JSONで置き換え復元
        </button>

        <button className="setting-action danger" type="button" onClick={handleReset}>
          <Trash2 size={20} aria-hidden="true" />
          データ初期化
        </button>

        <button className="setting-action" type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={20} aria-hidden="true" />
          再読み込み
        </button>
      </div>

      <input
        ref={importInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => handleImportFile(event.target.files?.[0])}
      />
    </section>
  );
}
