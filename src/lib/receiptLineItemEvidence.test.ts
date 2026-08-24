import { describe, expect, it } from "vitest";
import {
  createReceiptLineItemReconciliationEvidence,
  findLineItemSubtotal,
  findReceiptItemCount,
} from "./receiptLineItemEvidence";

describe("receipt line item evidence", () => {
  it("collects the declared count, subtotal, and ordered amounts before the total", () => {
    const evidence = createReceiptLineItemReconciliationEvidence([
      "商品A ¥100",
      "小計 3点 ¥600",
      "¥200",
      "¥300",
      "¥600",
      "合計 ¥660",
      "お預り ¥1,000",
    ]);

    expect(evidence.declaredItemCount).toBe(3);
    expect(evidence.subtotal).toBe(600);
    expect(evidence.columnOrderedAmounts.map((item) => item.amount)).toEqual([200, 300, 600]);
  });

  it("uses a separate next line for the subtotal but not a tax summary line", () => {
    expect(findLineItemSubtotal(["小計", "¥1,000", "8%税 ¥80"])).toBe(1_000);
    expect(findLineItemSubtotal(["小計", "8%税 ¥80"])).toBeNull();
  });

  it.each([
    [["点数 7個"], 7],
    [["1点買"], 1],
    [["小計 18点 ¥5,699"], 18],
    [["商品数: 0"], null],
  ])("extracts a positive declared item count from %o", (lines, expected) => {
    expect(findReceiptItemCount(lines as string[])).toBe(expected);
  });

  it("does not collect payment or footer amounts as reconciliation evidence", () => {
    const evidence = createReceiptLineItemReconciliationEvidence([
      "小計 ¥100",
      "¥200",
      "合計 ¥300",
      "お預り ¥1,000",
      "お釣り ¥700",
      "累計ポイント 500P",
    ]);

    expect(evidence.columnOrderedAmounts.map((item) => item.amount)).toEqual([200]);
  });
});
