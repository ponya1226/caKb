import { useEffect, useMemo, useState } from "react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus } from "lucide-react";
import { currentMonthKey, formatMonthLabel } from "../lib/date";
import { buildDashboardStats, buildMonthOptions } from "../lib/dashboardStats";
import { formatCurrency, formatPercent } from "../lib/format";
import type { Category, Expense } from "../types";

type DashboardScreenProps = {
  expenses: Expense[];
  categories: Category[];
  onAddExpense: () => void;
};

export function DashboardScreen({ expenses, categories, onAddExpense }: DashboardScreenProps) {
  const monthOptions = useMemo(() => buildMonthOptions(expenses), [expenses]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const stats = useMemo(
    () => buildDashboardStats(expenses, categories, selectedMonth),
    [categories, expenses, selectedMonth],
  );

  useEffect(() => {
    if (!monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0] ?? currentMonthKey());
    }
  }, [monthOptions, selectedMonth]);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">{formatMonthLabel(selectedMonth)}</p>
          <h1>ダッシュボード</h1>
        </div>
        <button className="icon-button" type="button" onClick={onAddExpense} aria-label="支出を追加">
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
      </div>

      <div className="metrics-grid">
        <div className="metric-panel">
          <span className="metric-label">対象月の支出</span>
          <strong>{formatCurrency(stats.currentTotal)}</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">前月比</span>
          <strong className={stats.monthDiff > 0 ? "tone-danger" : "tone-good"}>{formatPercent(stats.monthDiff)}</strong>
        </div>
        <div className="metric-panel">
          <span className="metric-label">レシート登録分</span>
          <strong>{formatCurrency(stats.receiptTotal)}</strong>
          <span className="metric-detail">{stats.currentMonthReceiptExpenses.length}件</span>
        </div>
      </div>

      <section className="content-section">
        <div className="section-title-row">
          <h2>カテゴリ別支出</h2>
        </div>
        {stats.categoryTotals.length === 0 ? (
          <div className="empty-state">対象月の支出はありません</div>
        ) : (
          <div className="chart-area chart-area-pie">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={stats.categoryTotals} dataKey="value" nameKey="name" innerRadius={54} outerRadius={88} paddingAngle={2}>
                  {stats.categoryTotals.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="legend-list">
              {stats.categoryTotals.map((item) => (
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
            <LineChart data={stats.dailyTotals} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
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
