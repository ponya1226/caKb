import { describe, expect, it } from "vitest";
import { ReceiptLineItemAssociator } from "./receiptLineItemAssociation";

function createName(index: number) {
  return {
    name: `商品${index}`,
    line: `0${index} 商品${index}`,
    hasItemCode: true,
    isDiscount: false,
  };
}

describe("ReceiptLineItemAssociator", () => {
  it("keeps a profile-sized name column in order until its amount column arrives", () => {
    const associator = new ReceiptLineItemAssociator(5);
    [1, 2, 3, 4, 5].forEach((index) => associator.addName(createName(index)));
    [100, 200, 300, 400, 500].forEach((amount) => {
      associator.pairPendingNameWithAmount({ amount, line: `¥${amount}`, confidence: 0.8 });
    });

    expect(associator.getCandidates().map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["商品1", 100],
      ["商品2", 200],
      ["商品3", 300],
      ["商品4", 400],
      ["商品5", 500],
    ]);
  });

  it("moves names outside the configured window to reconciliation", () => {
    const associator = new ReceiptLineItemAssociator(2);
    associator.addName(createName(1));
    associator.addName(createName(2));
    associator.addName(createName(3));

    expect(associator.getUnmatchedNames().map((item) => item.name)).toEqual(["商品1"]);
  });
});
