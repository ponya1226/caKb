import { describe, expect, it } from "vitest";
import {
  cleanLineItemName,
  extractAmountMatchesFromLine,
  extractLineItemAmountMatchesFromLine,
  isLineItemAmountOnlyLine,
  parseReceiptAmountValue,
} from "./receiptAmounts";

describe("receipt amount parsing", () => {
  it.each([
    ["¥１，０００", 1_000],
    ["\\1,000", 1_000],
    ["¥1,00C", 1_000],
    ["（¥４９８）", 498],
  ])("normalizes OCR amount text: %s", (value, expected) => {
    expect(parseReceiptAmountValue(value)).toBe(expected);
  });

  it.each(["", "¥0", "10000001"])('rejects an invalid receipt amount: "%s"', (value) => {
    expect(parseReceiptAmountValue(value)).toBeNull();
  });

  it("keeps the payable value while excluding nearby non-price number tokens", () => {
    const cases = [
      ["18:17", []],
      ["10%対象", []],
      ["01 商品 ¥159", [159]],
      ["外8 0012 商品 ¥498", [498]],
      ["生ハム 110g ¥299", [299]],
      ["登録番号 T4011502001852", []],
    ] as const;

    cases.forEach(([line, expected]) => {
      expect(extractAmountMatchesFromLine(line, 1).map((match) => match.amount)).toEqual(expected);
    });
  });

  it("preserves small currency-marked item prices", () => {
    expect(extractLineItemAmountMatchesFromLine("スーパーバッグ ¥5").map((match) => match.amount)).toEqual([5]);
  });

  it("exposes a negative discount amount only in discount context", () => {
    const discountAmounts = extractLineItemAmountMatchesFromLine("★割引(10%) -47")
      .map((match) => match.amount);
    const productAmounts = extractLineItemAmountMatchesFromLine("商品 -47")
      .map((match) => match.amount);

    expect(discountAmounts).toContain(-47);
    expect(productAmounts).not.toContain(-47);
  });

  it("deduplicates equal values without changing their first position", () => {
    const matches = extractAmountMatchesFromLine("小計 ¥100 税込 100", 1);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ amount: 100, hasMoneySymbol: true });
  });

  it("removes the matched token before classifying an amount-only line", () => {
    const [itemMatch] = extractLineItemAmountMatchesFromLine("01 商品A ¥159");
    const [amountOnlyMatch] = extractLineItemAmountMatchesFromLine("¥159");

    expect(cleanLineItemName("01 商品A ¥159", itemMatch)).toBe("商品A");
    expect(isLineItemAmountOnlyLine("01 商品A ¥159", itemMatch)).toBe(false);
    expect(isLineItemAmountOnlyLine("¥159", amountOnlyMatch)).toBe(true);
  });
});
