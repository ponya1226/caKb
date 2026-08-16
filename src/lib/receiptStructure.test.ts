import { describe, expect, it } from "vitest";
import {
  findAmountCandidateEndIndex,
  getReceiptStructureBoundary,
  isLineItemReconciliationBoundary,
  isReceiptTaxAmountLine,
  isReceiptTaxBaseAmountLine,
} from "./receiptStructure";

describe("receipt structure", () => {
  it("classifies split totals and post-total sections", () => {
    const lines = [
      "商品A ¥300",
      "小計 ¥300",
      "合",
      "計 ¥300",
      "現金 ¥500",
      "お釣り ¥200",
      "会員ランク",
    ];

    expect(lines.map((_, index) => getReceiptStructureBoundary(lines, index))).toEqual([
      null,
      "subtotal",
      "payableTotal",
      "payableTotal",
      "tendered",
      "postPayment",
      "footer",
    ]);
  });

  it("ends amount candidates at tendered cash only after a payable total", () => {
    expect(findAmountCandidateEndIndex([
      "商品A ¥300",
      "合計 ¥300",
      "現金 ¥500",
      "お釣り ¥200",
    ])).toBe(2);

    expect(findAmountCandidateEndIndex([
      "商品A ¥300",
      "電子決済支払 ¥300",
      "お釣り ¥0",
    ])).toBe(2);
  });

  it("separates tax amounts from taxable base amounts", () => {
    expect(isReceiptTaxAmountLine("8%税 ¥80")).toBe(true);
    expect(isReceiptTaxBaseAmountLine("8%税抜対象額 ¥1,000")).toBe(true);
    expect(isReceiptTaxAmountLine("8%税抜対象額 ¥1,000")).toBe(false);
  });

  it("limits column reconciliation at every transaction-ending boundary", () => {
    expect(isLineItemReconciliationBoundary("payableTotal")).toBe(true);
    expect(isLineItemReconciliationBoundary("payment")).toBe(true);
    expect(isLineItemReconciliationBoundary("tendered")).toBe(true);
    expect(isLineItemReconciliationBoundary("postPayment")).toBe(true);
    expect(isLineItemReconciliationBoundary("footer")).toBe(true);
    expect(isLineItemReconciliationBoundary("subtotal")).toBe(false);
    expect(isLineItemReconciliationBoundary("tax")).toBe(false);
  });
});
