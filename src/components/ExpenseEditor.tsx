import { FormEvent, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { isValidDateInput, toDateInputValue } from "../lib/date";
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
    }),
    [initialValues],
  );
  const [values, setValues] = useState<ExpenseFormValues>(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      await onSubmit({ ...values, amount: Math.round(values.amount) });
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
