import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { ExpenseEditor } from "./ExpenseEditor";
import { currentMonthKey, formatDateLabel, formatMonthLabel, toMonthKey } from "../lib/date";
import { formatCurrency } from "../lib/format";
import type { Category, Expense, ExpenseFormValues } from "../types";

type ExpenseListScreenProps = {
  expenses: Expense[];
  categories: Category[];
  categoryMap: Map<string, Category>;
  onAddExpense: (values: ExpenseFormValues) => Promise<void>;
  onUpdateExpense: (expense: Expense, values: ExpenseFormValues) => Promise<void>;
  onDeleteExpense: (expense: Expense) => Promise<void>;
};

export function ExpenseListScreen({
  expenses,
  categories,
  categoryMap,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}: ExpenseListScreenProps) {
  const monthOptions = useMemo(() => {
    const months = new Set(expenses.map((expense) => toMonthKey(expense.date)));
    months.add(currentMonthKey());
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [expenses]);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0] ?? currentMonthKey());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [isAdding, setIsAdding] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const monthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === selectedMonth);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleExpenses = monthExpenses.filter((expense) => {
    const category = categoryMap.get(expense.categoryId);
    const matchesCategory = selectedCategoryId === "all" || expense.categoryId === selectedCategoryId;

    if (!matchesCategory) {
      return false;
    }

    if (!normalizedSearchQuery) {
      return true;
    }

    const searchableText = [expense.shopName, expense.memo, category?.name ?? ""]
      .join(" ")
      .toLocaleLowerCase();
    return searchableText.includes(normalizedSearchQuery);
  });
  const visibleTotal = visibleExpenses.reduce((total, expense) => total + expense.amount, 0);
  const hasActiveFilters = normalizedSearchQuery.length > 0 || selectedCategoryId !== "all";

  async function handleDelete(expense: Expense) {
    if (!window.confirm("この支出を削除しますか？")) {
      return;
    }

    await onDeleteExpense(expense);
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">{formatCurrency(visibleTotal)}</p>
          <h1>支出一覧</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => setIsAdding(true)} aria-label="支出を追加">
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="toolbar">
        <label className="field compact-field">
          <span>対象月</span>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {monthOptions.map((month) => (
              <option key={month} value={month}>
                {formatMonthLabel(month)}
              </option>
            ))}
          </select>
        </label>

        <label className="field search-field">
          <span>検索</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="店舗名・メモ・カテゴリ"
          />
        </label>

        <label className="field compact-field">
          <span>カテゴリ</span>
          <select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
            <option value="all">すべて</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAdding && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="支出の追加">
            <div className="modal-title-row">
              <h2>手入力</h2>
              <button className="icon-button small" type="button" onClick={() => setIsAdding(false)} aria-label="閉じる">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ExpenseEditor
              categories={categories}
              submitLabel="保存"
              onCancel={() => setIsAdding(false)}
              onSubmit={async (values) => {
                await onAddExpense(values);
                setIsAdding(false);
              }}
            />
          </div>
        </div>
      )}

      {editingExpense && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel" role="dialog" aria-modal="true" aria-label="支出の編集">
            <div className="modal-title-row">
              <h2>編集</h2>
              <button className="icon-button small" type="button" onClick={() => setEditingExpense(null)} aria-label="閉じる">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ExpenseEditor
              categories={categories}
              initialValues={editingExpense}
              submitLabel="更新"
              onCancel={() => setEditingExpense(null)}
              onSubmit={async (values) => {
                await onUpdateExpense(editingExpense, values);
                setEditingExpense(null);
              }}
            />
          </div>
        </div>
      )}

      <div className="expense-list">
        {visibleExpenses.length === 0 ? (
          <div className="empty-state">
            {monthExpenses.length === 0
              ? "この月の支出はありません"
              : hasActiveFilters
                ? "検索条件に一致する支出はありません"
                : "表示できる支出はありません"}
          </div>
        ) : (
          visibleExpenses.map((expense) => {
            const category = categoryMap.get(expense.categoryId);
            return (
              <article key={expense.id} className="expense-item">
                <div className="expense-main">
                  <span className="expense-date">{formatDateLabel(expense.date)}</span>
                  <strong>{expense.shopName}</strong>
                  <span className="category-pill">
                    <span className="color-dot" style={{ background: category?.color ?? "#64748b" }} />
                    {category?.name ?? "未分類"}
                  </span>
                </div>
                <div className="expense-side">
                  <strong>{formatCurrency(expense.amount)}</strong>
                  <div className="item-actions">
                    <button className="icon-button small" type="button" onClick={() => setEditingExpense(expense)} aria-label="編集">
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button className="icon-button small danger" type="button" onClick={() => handleDelete(expense)} aria-label="削除">
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
