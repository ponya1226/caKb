import { describe, expect, it } from "vitest";
import { formatReceiptRecognitionReport } from "./receiptRecognitionReport";

describe("formatReceiptRecognitionReport", () => {
  it("合計金額、認識品目、品目合計、差額をコピー用に整形する", () => {
    const report = formatReceiptRecognitionReport({
      amount: 5610,
      lineItems: [
        { id: "item-1", name: "サンプル商品", amount: 5195, source: "ocr" },
        { id: "item-2", name: "割引", amount: -47, source: "ocr" },
      ],
    });

    expect(report).toContain("合計金額: ￥5,610");
    expect(report).toContain("品目: 2件");
    expect(report).toContain("1. サンプル商品 / ￥5,195");
    expect(report).toContain("2. 割引 / -￥47");
    expect(report).toContain("品目合計: ￥5,148");
    expect(report).toContain("総額との差額: ￥462");
  });

  it("品目が認識されていない場合も合計金額をコピーできる", () => {
    const report = formatReceiptRecognitionReport({ amount: 348 });

    expect(report).toContain("合計金額: ￥348");
    expect(report).toContain("品目: 0件");
    expect(report).toContain("品目は認識されませんでした");
    expect(report).toContain("総額との差額: ￥348");
  });
});
