import { describe, expect, it } from "vitest";
import {
  createPendingReceiptDiscountName,
  createPendingReceiptLineItemName,
  isPotentialReceiptLineItemNameLine,
  isReceiptAmountSectionLabel,
  isReceiptLineItemDiscountMarker,
  isReceiptMarkerLine,
  normalizeReceiptLineItemName,
  shouldSkipReceiptLineItemLine,
} from "./receiptLineItemClassification";
import { detectReceiptLineItemProfile } from "./receiptLineItemProfiles";

const groceryLines = [
  "01 *商品A",
  "03* (冷凍) 商品B",
  "05 商品C",
  "小計 3点 ¥600",
];
const groceryProfile = detectReceiptLineItemProfile(groceryLines);

describe("receipt line item classification", () => {
  it("normalizes item codes while preserving meaningful product attributes", () => {
    expect(normalizeReceiptLineItemName("03* (冷凍) 商品A")).toBe("(冷凍) 商品A");
    expect(normalizeReceiptLineItemName("外8 0012* 商品B*")).toBe("商品B");
  });

  it("classifies marked department-code rows as product names", () => {
    expect(isPotentialReceiptLineItemNameLine("03* (冷凍) 商品B", groceryProfile)).toBe(true);
    expect(createPendingReceiptLineItemName("03* (冷凍) 商品B", groceryProfile)).toMatchObject({
      name: "(冷凍) 商品B",
      hasItemCode: true,
      isDiscount: false,
    });
  });

  it.each([
    "8%税額 ¥40",
    "(@199 × 2個)",
    "電話 00-0000-0000",
    "架空県架空市中央区 1-2-3",
    "交通系マネー ¥500",
    "2026年08月22日 10:21",
    "0000000000000",
  ])("excludes non-product row: %s", (line) => {
    expect(shouldSkipReceiptLineItemLine(line)).toBe(true);
  });

  it("keeps ordinary product rows", () => {
    expect(shouldSkipReceiptLineItemLine("03* (冷凍) 商品B")).toBe(false);
  });

  it("classifies discount markers without requiring a store-specific rule", () => {
    expect(isReceiptLineItemDiscountMarker("★*05|(10%)")).toBe(true);
    expect(createPendingReceiptDiscountName("★*05|(10%)")).toMatchObject({
      name: "割引(10%)",
      isDiscount: true,
    });
  });

  it("classifies summary labels and receipt markers", () => {
    expect(isReceiptAmountSectionLabel("税込金額合計")).toBe(true);
    expect(isReceiptMarkerLine("領収証")).toBe(true);
    expect(isReceiptMarkerLine("商品A")).toBe(false);
  });
});
