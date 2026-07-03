import { Download, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { buildExpensesCsv, downloadCsv } from "../lib/csv";
import { currentMonthKey } from "../lib/date";
import type { AppSettings, Category, Expense } from "../types";

type SettingsScreenProps = {
  expenses: Expense[];
  categories: Category[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onResetData: () => Promise<void>;
};

export function SettingsScreen({ expenses, categories, settings, onUpdateSettings, onResetData }: SettingsScreenProps) {
  function handleExport() {
    const csv = buildExpensesCsv(expenses, categories);
    downloadCsv(`kakeibo-expenses-${currentMonthKey()}.csv`, csv);
  }

  async function handleReset() {
    if (!window.confirm("すべての支出データを初期化しますか？")) {
      return;
    }

    await onResetData();
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Local</p>
          <h1>設定</h1>
        </div>
      </div>

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

        <button className="setting-action" type="button" onClick={handleExport}>
          <Download size={20} aria-hidden="true" />
          CSVエクスポート
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
    </section>
  );
}
