import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateLabel, formatMonthLabel } from "../lib/date";
import { formatCurrency } from "../lib/format";
import { buildYearlyStats, buildYearOptions, currentYearKey, formatYearLabel } from "../lib/yearlyStats";
import type { Category, Expense } from "../types";

type YearlyExpenseScreenProps = {
  expenses: Expense[];
  categories: Category[];
  categoryMap: Map<string, Category>;
};

export function YearlyExpenseScreen({ expenses, categories, categoryMap }: YearlyExpenseScreenProps) {
  const yearOptions = useMemo(() => buildYearOptions(expenses), [expenses]);
  const [selectedYear, setSelectedYear] = useState(yearOptions[0] ?? currentYearKey());
  const stats = useMemo(
    () => buildYearlyStats(expenses, categories, selectedYear),
    [categories, expenses, selectedYear],
  );

  useEffect(() => {
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0] ?? currentYearKey());
    }
  }, [selectedYear, yearOptions]);

  const yearlyExpenses = stats.expenses;

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">{formatYearLabel(selectedYear)}</p>
          <h1>年間支出</h1>
        </div>
      </div>

      <div className="toolbar">
        <label className="field compact-field">
          <span>対象年</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {formatYearLabel(year)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="metrics-grid">
        <div className="metric-panel">
          <span className="metric-label">年間支出</span>
          <strong>{formatCurrency(stats.total)}</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">支出件数</span>
          <strong>{yearlyExpenses.length}件</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">レシート登録分</span>
          <strong>{formatCurrency(stats.receiptTotal)}</strong>
          <span className="metric-detail">{stats.receiptCount}件</span>
        </div>
      </div>

      <section className="content-section">
        <div className="section-title-row">
          <h2>月別支出</h2>
        </div>
        <div className="chart-area">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.monthTotals} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
              <XAxis dataKey="monthKey" tickFormatter={(value) => `${Number(String(value).slice(5, 7))}月`} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tickLine={false} axisLine={false} width={38} />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={(label) => formatMonthLabel(String(label))}
              />
              <Bar dataKey="amount" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>カテゴリ別年間支出</h2>
        </div>
        {stats.categoryTotals.length === 0 ? (
          <div className="empty-state">対象年の支出はありません</div>
        ) : (
          <div className="legend-list">
            {stats.categoryTotals.map((item) => (
              <div key={item.id} className="legend-item">
                <span className="color-dot" style={{ background: item.color }} />
                <span>{item.name}</span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>年間明細</h2>
        </div>
        <div className="expense-list compact-list">
          {yearlyExpenses.length === 0 ? (
            <div className="empty-state">対象年の支出はありません</div>
          ) : (
            yearlyExpenses.map((expense) => {
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
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}
