import { FormEvent, useMemo, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { isValidDateInput, toDateInputValue } from "../lib/date";
import { formatCurrency } from "../lib/format";
import { createEmptyLineItem, normalizeExpenseLineItems, sumExpenseLineItems } from "../lib/lineItems";
import type { Category, ExpenseFormValues } from "../types";

type ExpenseEditorProps = {
  categories: Category[];
  initialValues?: Partial<ExpenseFormValues>;
  submitLabel: string;
  onSubmit: (values: ExpenseFormValues) => Promise<void> | void;
  onCancel?: () => void;
};

export function ExpenseEditor({ categories, initialValues, submitLabel, onSubmit, onCancel }: ExpenseEditorProps) {
  const defaultValues = useMemo<ExpenseFormValues>(
    () => ({
      date: initialValues?.date ?? toDateInputValue(new Date()),
      shopName: initialValues?.shopName ?? "",
      amount: initialValues?.amount ?? 0,
      categoryId: initialValues?.categoryId ?? DEFAULT_CATEGORY_ID,
      memo: initialValues?.memo ?? "",
      lineItems: initialValues?.lineItems ?? [],
    }),
    [initialValues],
  );
  const [values, setValues] = useState<ExpenseFormValues>(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lineItems = values.lineItems ?? [];
  const lineItemTotal = useMemo(() => sumExpenseLineItems(lineItems), [lineItems]);
  const lineItemDiff = lineItemTotal - values.amount;

  function updateLineItem(id: string, updates: Partial<NonNullable<ExpenseFormValues["lineItems"]>[number]>) {
    setValues((current) => ({
      ...current,
      lineItems: (current.lineItems ?? []).map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }

  function addLineItem() {
    setValues((current) => ({
      ...current,
      lineItems: [...(current.lineItems ?? []), createEmptyLineItem()],
    }));
  }

  function removeLineItem(id: string) {
    setValues((current) => ({
      ...current,
      lineItems: (current.lineItems ?? []).filter((item) => item.id !== id),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValidDateInput(values.date)) {
      setError("日付を確認してください");
      return;
    }

    if (!values.shopName.trim()) {
      setError("店舗名を入力してください");
      return;
    }

    if (!Number.isFinite(values.amount) || values.amount <= 0) {
      setError("金額を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      const normalizedLineItems = normalizeExpenseLineItems(values.lineItems);
      await onSubmit({
        date: values.date,
        shopName: values.shopName,
        amount: Math.round(values.amount),
        categoryId: values.categoryId,
        memo: values.memo,
        ...(normalizedLineItems ? { lineItems: normalizedLineItems } : {}),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <label className="field">
        <span>日付</span>
        <input
          type="date"
          value={values.date}
          onChange={(event) => setValues((current) => ({ ...current, date: event.target.value }))}
          required
        />
      </label>

      <label className="field">
        <span>店舗名</span>
        <input
          type="text"
          value={values.shopName}
          onChange={(event) => setValues((current) => ({ ...current, shopName: event.target.value }))}
          placeholder="店舗名"
          required
        />
      </label>

      <label className="field">
        <span>金額</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={values.amount || ""}
          onChange={(event) => setValues((current) => ({ ...current, amount: Number(event.target.value) }))}
          placeholder="0"
          required
        />
      </label>

      <label className="field">
        <span>カテゴリ</span>
        <select
          value={values.categoryId}
          onChange={(event) => setValues((current) => ({ ...current, categoryId: event.target.value }))}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>メモ</span>
        <textarea
          value={values.memo}
          onChange={(event) => setValues((current) => ({ ...current, memo: event.target.value }))}
          rows={3}
          placeholder="メモ"
        />
      </label>

      <details className="line-item-editor">
        <summary>
          <span>品目明細</span>
          <small>
            {lineItems.length > 0
              ? `${lineItems.length}件 / ${formatCurrency(lineItemTotal)}`
              : "未入力"}
          </small>
        </summary>
        <div className="line-item-editor-body">
          {lineItems.length > 0 ? (
            lineItems.map((item) => (
              <div className="line-item-row" key={item.id}>
                <label className="field">
                  <span>品目名</span>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(event) => updateLineItem(item.id, { name: event.target.value })}
                    placeholder="品目名"
                  />
                </label>
                <label className="field line-item-amount-field">
                  <span>金額</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    value={item.amount || ""}
                    onChange={(event) => updateLineItem(item.id, { amount: Number(event.target.value) })}
                    placeholder="0"
                  />
                </label>
                <button
                  className="icon-button small danger line-item-delete"
                  type="button"
                  onClick={() => removeLineItem(item.id)}
                  aria-label="品目を削除"
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="subtle-text">品目明細は未入力です。</p>
          )}
          <div className="line-item-summary">
            <span>品目合計 {formatCurrency(lineItemTotal)}</span>
            {lineItems.length > 0 && (
              <span className={lineItemDiff === 0 ? "line-item-diff matched" : "line-item-diff"}>
                総額との差分 {formatCurrency(lineItemDiff)}
              </span>
            )}
          </div>
          {lineItems.length > 0 && (
            <p className="subtle-text">税・割引・支払調整により、総額と一致しない場合があります。</p>
          )}
          <button className="button button-secondary button-compact" type="button" onClick={addLineItem}>
            <Plus size={16} aria-hidden="true" />
            品目を追加
          </button>
        </div>
      </details>

      {error && <p className="inline-error">{error}</p>}

      <div className="button-row">
        {onCancel && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            <X size={18} aria-hidden="true" />
            キャンセル
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={isSaving}>
          <Check size={18} aria-hidden="true" />
          {isSaving ? "保存中" : submitLabel}
        </button>
      </div>
    </form>
  );
}
