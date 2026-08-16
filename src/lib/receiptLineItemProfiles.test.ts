import { describe, expect, it } from "vitest";
import { detectReceiptLineItemProfile } from "./receiptLineItemProfiles";

describe("receipt line item profiles", () => {
  it("detects department-coded grocery layouts without using the store name", () => {
    const createLines = (storeName: string) => [
      storeName,
      "2026年08月16日 12:00",
      "01 商品A",
      "04 商品B",
      "07 商品C",
      "¥100",
      "¥200",
      "¥300",
      "小計 3点 ¥600",
    ];

    expect(detectReceiptLineItemProfile(createLines("SAMPLE GROCERY")).id).toBe(
      "department-coded-grocery",
    );
    expect(detectReceiptLineItemProfile(createLines("ANOTHER MARKET")).id).toBe(
      "department-coded-grocery",
    );
    expect(detectReceiptLineItemProfile([
      "SAMPLE GROCERY",
      "01 商品A",
      "04 商品B",
      "07 商品C",
      "小計",
      "3点 ¥600",
    ])).toMatchObject({
      id: "department-coded-grocery",
      maxPendingNames: 4,
    });
  });

  it("keeps non-matching and four-digit product-code layouts on the generic fallback", () => {
    expect(detectReceiptLineItemProfile([
      "0005 商品A",
      "0016 商品B",
      "小計 2点 ¥600",
    ]).id).toBe("generic");

    expect(detectReceiptLineItemProfile([
      "01 商品A",
      "02 商品B",
      "03 商品C",
      "合計 ¥600",
    ]).id).toBe("generic");
  });

  it("detects tax-prefixed grocery item codes without matching ordinary four-digit codes", () => {
    expect(detectReceiptLineItemProfile([
      "外8 0012 商品A ¥100",
      "外8 0021 商品B ¥200",
      "外10 0041 商品C ¥5",
      "買上点数",
      "3点",
    ])).toMatchObject({
      id: "department-coded-grocery",
      maxPendingNames: 4,
    });

    expect(detectReceiptLineItemProfile([
      "0005 商品A ¥100",
      "0016 商品B ¥200",
      "0041 商品C ¥300",
      "買上点数 3点",
    ]).id).toBe("generic");
  });
});
