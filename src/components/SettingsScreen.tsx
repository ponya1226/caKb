import { useEffect, useRef, useState } from "react";
import { Database, Download, FileJson, Plus, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Upload } from "lucide-react";
import { buildBackupJson, downloadJson, parseBackupJson } from "../lib/backup";
import { upsertShopCategoryRule } from "../lib/categorySuggestion";
import { buildExpensesCsv, downloadCsv } from "../lib/csv";
import { currentMonthKey, formatMonthLabel } from "../lib/date";
import { formatFileSize } from "../lib/format";
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
};

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
}: SettingsScreenProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<BackupImportMode>("append");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [newRuleShopName, setNewRuleShopName] = useState("");
  const [newRuleCategoryId, setNewRuleCategoryId] = useState(categories[0]?.id ?? "");
  const shopCategoryRules = settings.shopCategoryRules ?? [];

  useEffect(() => {
    if (!newRuleCategoryId && categories[0]) {
      setNewRuleCategoryId(categories[0].id);
    }
  }, [categories, newRuleCategoryId]);

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
