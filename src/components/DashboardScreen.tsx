import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { addMonths, currentMonthKey, formatMonthLabel, getDaysInMonth, toMonthKey } from "../lib/date";
import { formatCurrency, formatPercent } from "../lib/format";
import type { Category, Expense } from "../types";

type DashboardScreenProps = {
  expenses: Expense[];
  categories: Category[];
  onAddExpense: () => void;
};

export function DashboardScreen({ expenses, categories, onAddExpense }: DashboardScreenProps) {
  const monthKey = currentMonthKey();
  const previousMonthKey = addMonths(monthKey, -1);
  const currentMonthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === monthKey);
  const previousMonthExpenses = expenses.filter((expense) => toMonthKey(expense.date) === previousMonthKey);
  const currentMonthReceiptExpenses = currentMonthExpenses.filter((expense) => expense.source === "receipt");
  const currentTotal = currentMonthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const previousTotal = previousMonthExpenses.reduce((total, expense) => total + expense.amount, 0);
  const receiptTotal = currentMonthReceiptExpenses.reduce((total, expense) => total + expense.amount, 0);
  const monthDiff = previousTotal === 0 ? Number.NaN : ((currentTotal - previousTotal) / previousTotal) * 100;

  const categoryTotals = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      value: currentMonthExpenses
        .filter((expense) => expense.categoryId === category.id)
        .reduce((total, expense) => total + expense.amount, 0),
      color: category.color,
    }))
    .filter((item) => item.value > 0);

  const daysInMonth = getDaysInMonth(monthKey);
  const dailyTotals = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${`${day}`.padStart(2, "0")}`;
    return {
      day: `${day}`,
      amount: currentMonthExpenses
        .filter((expense) => expense.date === date)
        .reduce((total, expense) => total + expense.amount, 0),
    };
  });

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">{formatMonthLabel(monthKey)}</p>
          <h1>ダッシュボード</h1>
        </div>
        <button className="icon-button" type="button" onClick={onAddExpense} aria-label="支出を追加">
          <Plus size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="metrics-grid">
        <div className="metric-panel">
          <span className="metric-label">今月の支出</span>
          <strong>{formatCurrency(currentTotal)}</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">前月比</span>
          <strong className={monthDiff > 0 ? "tone-danger" : "tone-good"}>{formatPercent(monthDiff)}</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">レシート登録分</span>
          <strong>{formatCurrency(receiptTotal)}</strong>
          <span className="metric-detail">{currentMonthReceiptExpenses.length}件</span>
        </div>
      </div>

      <section className="content-section">
        <div className="section-title-row">
          <h2>カテゴリ別支出</h2>
        </div>
        {categoryTotals.length === 0 ? (
          <div className="empty-state">今月の支出はありません</div>
        ) : (
          <div className="chart-area chart-area-pie">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryTotals} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                  {categoryTotals.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-list">
              {categoryTotals.map((item) => (
                <div key={item.id} className="legend-item">
                  <span className="color-dot" style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>日別支出推移</h2>
        </div>
        <div className="chart-area">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyTotals} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tickLine={false} axisLine={false} width={38} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} labelFormatter={(label) => `${label}日`} />
              <Line type="monotone" dataKey="amount" stroke="#0f766e" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </section>
  );
}
