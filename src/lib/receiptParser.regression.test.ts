import { describe, expect, it } from "vitest";
import { parseReceiptText } from "./receiptParser";

function lineItems(text: string): Array<[string, number]> {
  return parseReceiptText(text).lineItemCandidates.map((candidate) => [candidate.name, candidate.amount]);
}

describe("receiptParser anonymized receipt regressions", () => {
  it("extracts one convenience-store product and excludes header, payment, and card details", () => {
    const result = parseReceiptText(`
      SAMPLE CONVENIENCE
      サンプル駅店
      登録番号 T0000000000000
      架空都架空区架空町 1 13
      電話: 000-0000-0000 店コード 000000
      2026年 8月 8日 (土) 16:25
      レジ #000000
      担当: サンプル
      348
      【領収証】
      やわらかロングタオルブルー
      合
      計
      (内消費税等
      ¥348
      \\31)
      (10%対象
      \\348)
      (内消費税額
      \\31)
      点
      数
      1個
      上記正に領収いたしました
      交通系マネー
      ¥348
      交通系マネー残高は以下の通りです。
      支払後残高
      ¥1,494
      カードNo
      SAMPLE-****-****-2760
    `);

    expect(result.amountCandidates[0]?.value).toBe(348);
    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["やわらかロングタオルブルー", 348],
    ]);
  });

  it("extracts Japanese convenience-store products and excludes payment and coupon sections", () => {
    const result = parseReceiptText(`
      SAMPLE CONVENIENCE
      サンプルコンビニ
      架空1丁目店
      架空県架空市中央区1-2-3
      電話 : 000-0000-0000 レジ #3
      事業者登録番号T0000000000000
      2026年07月01日 (水) 20:31
      領収書
      ポテトチップス うすしお味
      *168
      長芋わさび醤油仕立て
      *278
      小計 (税抜 8%) ¥446
      消費税等 (8%) ¥35
      合計 ¥481
      電子決済支払 ¥481
      お買上明細は上記のとおりです。
      [*] マークは軽減税率対象です。
      7/2 (木)
      1個無料クーポン
      【引換商品】
      ポテトチップス サンプル味
    `);

    expect(result.amountCandidates[0]?.value).toBe(481);
    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["ポテトチップス うすしお味", 168],
      ["長芋わさび醤油仕立て", 278],
    ]);
  });

  it("extracts a supermarket product without treating cash or change as products", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      サンプル団地店
      TEL 000-0000-0000
      領収証
      株式会社 サンプルフード
      登録番号 T0000000000000
      レジ 0186 2026/7/5(日) 14:12
      ベーキングパウダー 158
      小計 ¥158
      外税 8%対象額 ¥158
      外税8% ¥12
      合計 ¥170
      現金 ¥1,020
      お釣り ¥850
      お買上商品数:1
      ポイント会員募集中
    `);

    expect(result.amountCandidates[0]?.value).toBe(170);
    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["ベーキングパウダー", 158],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([12, 170, 850, 1020]),
    );
  });

  it("extracts a tea product and excludes promotional dates and tax summaries", () => {
    const result = parseReceiptText(`
      SAMPLE TEA
      架空新都心店
      架空県架空市中央区
      000-000-0000
      5月10日は記念日
      季節のおすすめギフト
      2026年04月05日(日) 16:37:36
      DECAF SAMPLE TB10 ¥1,000 *
      合計 ¥1,000
      (10%内税対象額 ¥0
      10%対象内消費税 ¥0)
      (8%内税対象額 ¥1,000
      8%対象内消費税 ¥74)
      お預り ¥1,000
      おつり ¥0
      登録番号 T0000000000000
    `);

    expect(result.amountCandidates[0]?.value).toBe(1000);
    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["DECAF SAMPLE TB10", 1000],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([10, 74]),
    );
  });

  it("pairs split grocery prices, keeps a discount, and excludes the settlement section", () => {
    const result = parseReceiptText(`
      SAMPLE GROCERY
      架空店
      2026年07月03日 (金) 14:34
      01 きゃべつ
      ¥159
      01 レタス
      ¥119
      01 ミニトマト (大パック
      ¥359
      ★割引(20%)
      -60
      04 国産若鶏むね肉 2枚 ¥741
      24 生ハム 110g
      ¥299
      小計 5点 ¥1,617
      税込金額合計 ¥1,746
      8%税抜対象額 ¥1,617
      8%税 ¥129
      お買上計 ¥1,746
      お預り計 ¥2,000
      お釣り ¥254
      56P
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["きゃべつ", 159],
      ["レタス", 119],
      ["ミニトマト (大パック", 359],
      ["割引(20%)", -60],
      ["国産若鶏むね肉 2枚", 741],
      ["生ハム 110g", 299],
    ]);
    expect(result.lineItemCandidates.reduce((sum, candidate) => sum + candidate.amount, 0)).toBe(1617);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([5, 56, 129, 1746, 2000, 254]),
    );
  });

  it("keeps more than twenty products on a long grocery receipt", () => {
    const products = Array.from({ length: 25 }, (_, index) => {
      const itemNumber = `${index + 1}`.padStart(2, "0");
      return `01 商品${itemNumber} ¥${100 + index}`;
    });
    const result = lineItems(`
      SAMPLE GROCERY
      2026年07月03日 (金) 14:34
      ${products.join("\n")}
      小計 25点 ¥2,800
      合計 ¥3,024
    `);

    expect(result).toHaveLength(25);
    expect(result[0]).toEqual(["商品01", 100]);
    expect(result[24]).toEqual(["商品25", 124]);
  });
});
