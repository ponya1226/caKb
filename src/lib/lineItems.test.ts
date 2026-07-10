import { describe, expect, it } from "vitest";
import { createLineItemsFromCandidates, normalizeExpenseLineItems, sumExpenseLineItems } from "./lineItems";

describe("lineItems", () => {
  it("keeps negative discount candidates when converting OCR line items", () => {
    const lineItems = createLineItemsFromCandidates([
      {
        name: "きゃべつ",
        amount: 159,
        line: "01 きゃべつ / ¥159",
        confidence: 0.8,
      },
      {
        name: "割引(20%)",
        amount: -60,
        line: "★割引(20%) / -60",
        confidence: 0.72,
      },
    ]);

    expect(lineItems.map((item) => [item.name, item.amount, item.source])).toEqual([
      ["きゃべつ", 159, "ocr"],
      ["割引(20%)", -60, "ocr"],
    ]);
    expect(sumExpenseLineItems(lineItems)).toBe(99);
  });

  it("drops empty and zero amount items but keeps manual negative adjustments", () => {
    const lineItems = normalizeExpenseLineItems([
      { id: "line-item-1", name: "商品", amount: 100.4, source: "manual" },
      { id: "line-item-2", name: "割引", amount: -20.2, source: "manual" },
      { id: "line-item-3", name: "空金額", amount: 0, source: "manual" },
      { id: "line-item-4", name: "", amount: -10, source: "manual" },
    ]);

    expect(lineItems?.map((item) => [item.name, item.amount])).toEqual([
      ["商品", 100],
      ["割引", -20],
    ]);
  });
});
