import type { Category, Expense } from "../types";

function escapeCsvValue(value: string | number | undefined): string {
  const rawValue = value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(rawValue)) {
    return `"${rawValue.replace(/"/g, '""')}"`;
  }

  return rawValue;
}

export function buildExpensesCsv(expenses: Expense[], categories: Category[]): string {
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const headers = [
    "id",
    "date",
    "shopName",
    "category",
    "amount",
    "memo",
    "source",
    "receiptImageId",
    "createdAt",
    "updatedAt",
    "lineItemsJson",
  ];

  const rows = expenses.map((expense) => [
    expense.id,
    expense.date,
    expense.shopName,
    categoryMap.get(expense.categoryId) ?? expense.categoryId,
    expense.amount,
    expense.memo,
    expense.source,
    expense.receiptImageId,
    expense.createdAt,
    expense.updatedAt,
    JSON.stringify(expense.lineItems ?? []),
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
