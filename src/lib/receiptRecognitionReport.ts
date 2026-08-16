import type { ExpenseLineItem } from "../types";
import { formatCurrency } from "./format";
import { sumExpenseLineItems } from "./lineItems";

type ReceiptRecognitionReportInput = {
  amount: number;
  lineItems?: ExpenseLineItem[];
};

export function formatReceiptRecognitionReport({
  amount,
  lineItems,
}: ReceiptRecognitionReportInput): string {
  const recognizedItems = (lineItems ?? []).filter((item) => item.name.trim().length > 0);
  const lineItemTotal = sumExpenseLineItems(recognizedItems);
  const difference = amount - lineItemTotal;
  const lines = [
    "caKb レシート読み取り結果",
    `合計金額: ${formatCurrency(amount)}`,
    `品目: ${recognizedItems.length}件`,
  ];

  if (recognizedItems.length === 0) {
    lines.push("- 品目は認識されませんでした");
  } else {
    recognizedItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.name.trim()} / ${formatCurrency(item.amount)}`);
    });
  }

  lines.push(
    `品目合計: ${formatCurrency(lineItemTotal)}`,
    `総額との差額: ${formatCurrency(difference)}`,
  );

  return lines.join("\n");
}
