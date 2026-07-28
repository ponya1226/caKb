import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { ExpenseEditor } from "./ExpenseEditor";
import { currentMonthKey, formatDateLabel, formatMonthLabel, getDaysInMonth, toMonthKey } from "../lib/date";
import { filterExpenses, parseOptionalAmount } from "../lib/expenseFilters";
import { formatCurrency } from "../lib/format";
import { sumExpenseLineItems } from "../lib/lineItems";
import type { Category, Expense, ExpenseFormValues } from "../types";

type ExpenseListScreenProps = {
  expenses: Expense[];
  categories: Category[];
  categoryMap: Map<string, Category>;
  memberNameMap: Map<string, string>;
  onAddExpense: (values: ExpenseFormValues) => Promise<void>;
  onUpdateExpense: (expense: Expense, values: ExpenseFormValues) => Promise<void>;
  onDeleteExpense: (expense: Expense) => Promise<void>;
};

export function ExpenseListScreen({
  expenses,
  categories,
  categoryMap,
  memberNameMap,
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0] ?? currentMonthKey());
      setDateFrom("");
      setDateTo("");
    }
  }, [monthOptions, selectedMonth]);

  const monthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === selectedMonth);
  const parsedMinAmount = parseOptionalAmount(minAmount);
  const parsedMaxAmount = parseOptionalAmount(maxAmount);
  const visibleExpenses = filterExpenses(monthExpenses, categoryMap, {
    searchQuery,
    categoryId: selectedCategoryId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    minAmount: parsedMinAmount,
    maxAmount: parsedMaxAmount,
  });
  const visibleTotal = visibleExpenses.reduce((total, expense) => total + expense.amount, 0);
  const hasAdvancedFilters = Boolean(dateFrom || dateTo || minAmount || maxAmount);
  const hasActiveFilters = searchQuery.trim().length > 0 || selectedCategoryId !== "all" || hasAdvancedFilters;
  const hasInvalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const hasInvalidAmountRange =
    parsedMinAmount !== undefined && parsedMaxAmount !== undefined && parsedMinAmount > parsedMaxAmount;
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = `${selectedMonth}-${`${getDaysInMonth(selectedMonth)}`.padStart(2, "0")}`;

  function handleMonthChange(nextMonth: string) {
    setSelectedMonth(nextMonth);
    setDateFrom("");
    setDateTo("");
  }

  function clearFilters() {
    setSearchQuery("");
    setSelectedCategoryId("all");
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
  }

  async function handleDelete(expense: Expense) {
    if (!window.confirm("この支出を削除しますか？")) {
      return;
    }

    setDeletingExpenseId(expense.id);
    try {
      await onDeleteExpense(expense);
      if (editingExpense?.id === expense.id) {
        setEditingExpense(null);
      }
    } catch (unknownError) {
      window.alert(unknownError instanceof Error ? unknownError.message : "削除に失敗しました");
    } finally {
      setDeletingExpenseId(null);
    }
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">
            {visibleExpenses.length}件 / {formatCurrency(visibleTotal)}
          </p>
          <h1>支出一覧</h1>
        </div>
        <button className="icon-button" type="button" onClick={() => setIsAdding(true)} aria-label="支出を追加">
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="toolbar">
        <label className="field compact-field">
          <span>対象月</span>
          <select value={selectedMonth} onChange={(event) => handleMonthChange(event.target.value)}>
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

      <details className="expense-filter-panel">
        <summary>
          <span>
            <SlidersHorizontal size={18} aria-hidden="true" />
            詳細条件
          </span>
          {hasAdvancedFilters && <span className="active-filter-badge">適用中</span>}
        </summary>
        <div className="expense-filter-body">
          <div className="advanced-filter-grid">
            <label className="field">
              <span>開始日</span>
              <input
                type="date"
                value={dateFrom}
                min={monthStart}
                max={dateTo || monthEnd}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>終了日</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || monthStart}
                max={monthEnd}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </label>
            <label className="field">
              <span>最小金額</span>
              <input
                type="number"
                inputMode="numeric"
                value={minAmount}
                min="0"
                step="1"
                max={maxAmount || undefined}
                placeholder="0"
                onChange={(event) => setMinAmount(event.target.value)}
              />
            </label>
            <label className="field">
              <span>最大金額</span>
              <input
                type="number"
                inputMode="numeric"
                value={maxAmount}
                min={minAmount || "0"}
                step="1"
                placeholder="上限なし"
                onChange={(event) => setMaxAmount(event.target.value)}
              />
            </label>
          </div>
          {(hasInvalidDateRange || hasInvalidAmountRange) && (
            <p className="filter-validation" role="alert">
              {hasInvalidDateRange ? "開始日は終了日以前にしてください。" : "最小金額は最大金額以下にしてください。"}
            </p>
          )}
          {hasActiveFilters && (
            <button className="button button-secondary button-compact filter-clear-button" type="button" onClick={clearFilters}>
              <RotateCcw size={16} aria-hidden="true" />
              条件をクリア
            </button>
          )}
        </div>
      </details>

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
            const lineItems = expense.lineItems ?? [];
            const lineItemTotal = sumExpenseLineItems(lineItems);
            return (
              <article key={expense.id} className="expense-item">
                <div className="expense-main">
                  <span className="expense-date">{formatDateLabel(expense.date)}</span>
                  <strong>{expense.shopName}</strong>
                  <span className="category-pill">
                    <span className="color-dot" style={{ background: category?.color ?? "#64748b" }} />
                    {category?.name ?? "未分類"}
                  </span>
                  {expense.createdByUid && (
                    <span className="expense-creator">
                      登録: {memberNameMap.get(expense.createdByUid) ?? "以前のメンバー"}
                    </span>
                  )}
                </div>
                <div className="expense-side">
                  <strong>{formatCurrency(expense.amount)}</strong>
                  <div className="item-actions">
                    <button className="icon-button small" type="button" onClick={() => setEditingExpense(expense)} aria-label="編集">
                      <Pencil size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button small danger"
                      type="button"
                      onClick={() => handleDelete(expense)}
                      aria-label="削除"
                      disabled={deletingExpenseId !== null}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {lineItems.length > 0 && (
                  <details className="expense-details">
                    <summary>
                      品目 {lineItems.length}件 / {formatCurrency(lineItemTotal)}
                    </summary>
                    <div className="expense-line-items">
                      {lineItems.map((item) => (
                        <div className="expense-line-item" key={item.id}>
                          <span>{item.name}</span>
                          <strong>{formatCurrency(item.amount)}</strong>
                        </div>
                      ))}
                      <div className="expense-line-item expense-line-item-total">
                        <span>品目合計</span>
                        <strong>{formatCurrency(lineItemTotal)}</strong>
                      </div>
                    </div>
                  </details>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
