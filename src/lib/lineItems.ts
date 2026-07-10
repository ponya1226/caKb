import type { ExpenseLineItem, ReceiptLineItemCandidate } from "../types";
import { createId } from "./id";

export function createLineItemsFromCandidates(candidates: ReceiptLineItemCandidate[]): ExpenseLineItem[] {
  return normalizeExpenseLineItems(
    candidates.map((candidate) => ({
      id: createId("line_item"),
      name: candidate.name,
      amount: candidate.amount,
      source: "ocr",
      confidence: candidate.confidence,
    })),
  ) ?? [];
}

export function createEmptyLineItem(): ExpenseLineItem {
  return {
    id: createId("line_item"),
    name: "",
    amount: 0,
    source: "manual",
  };
}

export function normalizeExpenseLineItems(lineItems: ExpenseLineItem[] | undefined): ExpenseLineItem[] | undefined {
  const normalizedItems = (lineItems ?? [])
    .map((item): ExpenseLineItem => {
      const normalizedItem: ExpenseLineItem = {
        id: item.id || createId("line_item"),
        name: item.name.trim(),
        amount: Math.round(item.amount),
        source: item.source === "ocr" ? "ocr" : "manual",
      };

      if (typeof item.confidence === "number" && Number.isFinite(item.confidence)) {
        normalizedItem.confidence = item.confidence;
      }

      return normalizedItem;
    })
    .filter((item) => item.name.length > 0 && Number.isFinite(item.amount) && item.amount !== 0);

  return normalizedItems.length > 0 ? normalizedItems : undefined;
}

export function sumExpenseLineItems(lineItems: ExpenseLineItem[] | undefined): number {
  return (lineItems ?? []).reduce((total, item) => total + item.amount, 0);
}
