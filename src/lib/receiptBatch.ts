export type ReceiptBatchStatus = "waiting" | "processing" | "completed" | "failed";

export type ReceiptBatchItem = {
  key: string;
  fileName: string;
  status: ReceiptBatchStatus;
  error?: string;
};

export function selectReceiptBatchKeys(items: ReceiptBatchItem[], failedOnly: boolean): Set<string> {
  if (!failedOnly) {
    return new Set(items.map((item) => item.key));
  }

  return new Set(
    items
      .filter((item) => item.status === "failed")
      .map((item) => item.key),
  );
}

export function orderReceiptBatchValues<T>(orderedKeys: string[], values: Record<string, T>): T[] {
  return orderedKeys
    .map((key) => values[key])
    .filter((value): value is T => value !== undefined);
}
