import { describe, expect, it } from "vitest";
import { orderReceiptBatchValues, selectReceiptBatchKeys, type ReceiptBatchItem } from "./receiptBatch";

const items: ReceiptBatchItem[] = [
  { key: "receipt-1", fileName: "1.jpg", status: "completed" },
  { key: "receipt-2", fileName: "2.jpg", status: "failed", error: "OCR failed" },
  { key: "receipt-3", fileName: "3.jpg", status: "completed" },
];

describe("receipt batch", () => {
  it("selects only failed receipts for retry", () => {
    expect([...selectReceiptBatchKeys(items, true)]).toEqual(["receipt-2"]);
    expect([...selectReceiptBatchKeys(items, false)]).toEqual(["receipt-1", "receipt-2", "receipt-3"]);
  });

  it("keeps successful drafts in the original image order", () => {
    expect(orderReceiptBatchValues(
      ["receipt-1", "receipt-2", "receipt-3"],
      {
        "receipt-3": "draft-3",
        "receipt-1": "draft-1",
      },
    )).toEqual(["draft-1", "draft-3"]);
  });
});
