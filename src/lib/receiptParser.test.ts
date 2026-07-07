import { describe, expect, it } from "vitest";
import { parseReceiptText, scoreReceiptParseResult } from "./receiptParser";

describe("parseReceiptText", () => {
  it("extracts date, shop name, and total amount near keywords", () => {
    const result = parseReceiptText(`
      サンプルスーパー
      2026/07/01
      小計 980
      税込合計 ¥1,058
    `);

    expect(result.dateCandidates[0]?.value).toBe("2026-07-01");
    expect(result.shopNameCandidates[0]?.value).toBe("サンプルスーパー");
    expect(result.amountCandidates[0]?.value).toBe(1058);
  });

  it("prioritizes amount near 合計", () => {
    const result = parseReceiptText(`
      テストストア
      商品A 980
      合計 1,280
    `);

    expect(result.amountCandidates[0]?.value).toBe(1280);
  });

  it("prioritizes amount near 税込", () => {
    const result = parseReceiptText(`
      テストストア
      小計 2,000
      税込 2,160
    `);

    expect(result.amountCandidates[0]?.value).toBe(2160);
  });

  it("prioritizes amount near 現計", () => {
    const result = parseReceiptText(`
      テストストア
      商品A 1,000
      現計 1,100
    `);

    expect(result.amountCandidates[0]?.value).toBe(1100);
  });

  it("returns fallback amount candidates when there are no amount keywords", () => {
    const result = parseReceiptText(`
      テストストア
      商品A 480
      商品B 980
    `);

    expect(result.amountCandidates.map((candidate) => candidate.value)).toEqual([980, 480]);
  });

  it("prioritizes yen-marked amounts over phone-like numbers in noisy OCR text", () => {
    const result = parseReceiptText(`
      サンプルティー店
      架空県架空市中央区
      架空町4丁目267-21F
      000-0000-1580
      2026年04月05日(日)      16:37
      DECAF SAMPLE TB10        ¥1, 00C
      =8           ¥1, 00¢
      8%内税対象額    ¥1, 0(
      お預り                       ¥1, 0(
    `);

    expect(result.amountCandidates[0]?.value).toBe(1000);
    expect(result.amountCandidates.map((candidate) => candidate.value)).not.toContain(1580);
  });

  it("prioritizes payment amount when a total line is truncated", () => {
    const result = parseReceiptText(`
      サンプルコンビニ
      小計 (税抜 8%)     ¥44
      消費税等 (8%)      ¥3
      合計               ¥48
      電子決済支払       ¥481
      買上明細は上記のとおりです
    `);

    expect(result.amountCandidates[0]?.value).toBe(481);
  });

  it("prioritizes total over cash tendered and excludes change amounts", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      サンプル団地店
      TEL
      000-0000-0000
      領収証
      株式会社 サンプルフード
      登録番号 T0000000000000
      レジ 0000 2026/7/5(日) 14:12
      商品 A 158
      小計
      \\158
      外税 8%対象額
      ¥158
      外税8%
      \\12
      合計
      \\170
      現金
      ¥1,020
      お釣り
      ¥850 らむ
      お買上商品数:1
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("SAMPLE MARKET サンプル団地店");
    expect(result.dateCandidates[0]?.value).toBe("2026-07-05");
    expect(result.amountCandidates[0]?.value).toBe(170);
    expect(result.amountCandidates.map((candidate) => candidate.value)).not.toContain(850);
    expect(result.amountCandidates.find((candidate) => candidate.value === 1020)?.confidence).toBeLessThan(
      result.amountCandidates[0]?.confidence ?? 0,
    );
  });

  it("extracts line item candidates from convenience store style rows", () => {
    const result = parseReceiptText(`
      SAMPLE CONVENIENCE
      2026年07月01日(水) 20:31
      Potato Chips うすしお味 *168
      Yam Snack 醤油仕立て *278
      小計 (税抜 8%) ¥446
      消費税等 (8%) ¥35
      合計 ¥481
      PayPay支払 ¥481
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Potato Chips うすしお味", 168],
      ["Yam Snack 醤油仕立て", 278],
    ]);
  });

  it("pairs convenience store split item names with star amount lines", () => {
    const result = parseReceiptText(`
      SAMPLE CONVENIENCE
      2026年07月01日(水) 20:31
      Potato Chips うすしお味
      *168
      Yam Snack 醤油仕立て
      *278
      小計 (税抜 8%) ¥446
      消費税等 (8%) ¥35
      合計 ¥481
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Potato Chips うすしお味", 168],
      ["Yam Snack 醤油仕立て", 278],
    ]);
  });

  it("extracts line item candidates from tea shop style yen rows", () => {
    const result = parseReceiptText(`
      SAMPLE TEA
      2026年04月05日(日) 16:37
      DECAF SAMPLE TB10 ¥1,000 *
      合計 ¥1,000
      お預り ¥1,000
      おつり ¥0
    `);

    expect(result.lineItemCandidates[0]).toMatchObject({
      name: "DECAF SAMPLE TB10",
      amount: 1000,
    });
    expect(result.lineItemCandidates.map((candidate) => candidate.name)).not.toContain("合計");
  });

  it("extracts line item candidates from supermarket rows with tax markers", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      レジ 0186 2026/7/5(日) 14:12
      Baking Powder 158※
      小計 ¥158
      外税8% ¥12
      合計 ¥170
      現金 ¥1,020
      お釣り ¥850
      登録番号 T0000000000000
      TEL 000-0000-0000
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Baking Powder", 158],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([170, 850, 1020]),
    );
  });

  it("does not treat change amount remnants as line items", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      Baking Powder 158※
      小計
      ¥158
      合計
      ¥170
      現金
      ¥1,020
      お釣り
      ¥850 らむ
      お買上商品数:1
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Baking Powder", 158],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toContain(850);
    expect(result.lineItemCandidates.map((candidate) => candidate.name)).not.toContain("らむ");
  });

  it("pairs split line item names with following amount-only lines", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      2026年07月03日(金) 14:34
      01 Cabbage
      ¥159
      01 Lettuce
      ¥119
      01 Mini Tomato Large Pack
      ¥359
      01 Banana Premium
      ¥299
      ★割引(20%)
      -60
      04 Chicken Breast 2pcs ¥741
      07 Chocolate Cream
      07 Pure Honey
      ¥239
      ¥499
      小計 18点 ¥5,699
      税込金額合計 ¥6,154
      お買上計 ¥6,154
      お預り計 ¥10,000
      お釣り ¥3,846
      登録番号 T0000000000000
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Cabbage", 159],
      ["Lettuce", 119],
      ["Mini Tomato Large Pack", 359],
      ["Banana Premium", 299],
      ["Chicken Breast 2pcs", 741],
      ["Chocolate Cream", 239],
      ["Pure Honey", 499],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([60, 5699, 6154, 10000, 3846]),
    );
  });

  it("ignores department codes and gram notation when pairing split supermarket rows", () => {
    const result = parseReceiptText(`
      SAMPLE MARKET
      24 Morning Fresh Half
      ¥299
      24 Raw Ham 110g
      ¥299
      24 Smoked Sausage Special ¥279
      24 Salad Chicken 3 Pack ¥299
      24 Salad Chicken Premium
      ¥299
      小計 18点 ¥5,699
      お買上計 ¥6,154
    `);

    expect(result.lineItemCandidates.map((candidate) => [candidate.name, candidate.amount])).toEqual([
      ["Morning Fresh Half", 299],
      ["Raw Ham 110g", 299],
      ["Smoked Sausage Special", 279],
      ["Salad Chicken 3 Pack", 299],
      ["Salad Chicken Premium", 299],
    ]);
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toEqual(
      expect.arrayContaining([24, 110, 5699, 6154]),
    );
  });

  it("does not treat promotional month-day text as a line item amount", () => {
    const result = parseReceiptText(`
      SAMPLE TEA
      5月10日は母の日
      お花の香りに包まれる華やかな
      ティータイムを贈りませんか
      2026年04月05日(日)
      DECAF SAMPLE TB10 ¥1,000 *
      合計
      ¥1,000
    `);

    expect(result.lineItemCandidates[0]).toMatchObject({
      name: "DECAF SAMPLE TB10",
      amount: 1000,
    });
    expect(result.lineItemCandidates.map((candidate) => candidate.amount)).not.toContain(10);
    expect(result.lineItemCandidates.map((candidate) => candidate.name)).not.toContain("5月 日は母の日");
  });

  it("normalizes full-width numbers and Japanese date notation", () => {
    const result = parseReceiptText(`
      テスト薬局
      ２０２６年７月２日
      現計 ３,４５０円
    `);

    expect(result.dateCandidates[0]?.value).toBe("2026-07-02");
    expect(result.amountCandidates[0]?.value).toBe(3450);
  });

  it("excludes receipt boilerplate, phone numbers, registration numbers, and total lines from shop candidates", () => {
    const result = parseReceiptText(`
      サンプルストア
      レシート
      TEL 03-1234-5678
      登録番号 T1234567890123
      合計 1,500
    `);

    expect(result.shopNameCandidates.map((candidate) => candidate.value)).toEqual(["サンプルストア"]);
  });

  it("returns date candidates as YYYY-MM-DD", () => {
    const result = parseReceiptText(`
      テストストア
      26/8/9
      合計 500
    `);

    expect(result.dateCandidates[0]?.value).toBe("2026-08-09");
  });

  it("does not include invalid date candidates", () => {
    const result = parseReceiptText(`
      テストストア
      2026/02/31
      2026/13/01
      合計 500
    `);

    expect(result.dateCandidates).toEqual([]);
  });

  it("extracts candidates from noisy anonymized OCR text", () => {
    const result = parseReceiptText(`
      6 -— 取引
      サン プル ス トア
      都 サンプル 区 架空 1ー2ー3
      電話 : 03-0000-0000 レッ “が
      者 登録 番号 「T0000000000000
      26 年 08 月 15 日 ( 土 ) 12:34 担 当 7
      商 品 A *120
      EHE UERELT *1,023
      計 ( 税 抜 8%) \\1,143
      肖 費 税 等 ( 8%) \\91
      5 提 店 ¥1,234
      税率 8X 対 象 1,234
      内 消費 税 等 8% \\91
      支 払 ¥1,234
      買上 明細 は 上 記 の と お り で す 。
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("サンプルストア");
    expect(result.dateCandidates[0]?.value).toBe("2026-08-15");
    expect(result.amountCandidates[0]?.value).toBe(1234);
  });

  it("extracts candidates from improved anonymized OCR text", () => {
    const result = parseReceiptText(`
      / ナ り -— の am
      ァ サプ ルス - ト ア
      架空 5 丁 目 店
      東京都 サンプル 区 架空 1ー2ー3
      電話 : 03-0000-0000 レツ“
      業者 登録 番号 T0000000000000
      26 年 08 月 15 日 ( 土 ) 12:34 担 当
      "商品 A " ぇ 4 つう *120
      =EDSUBREIAUT %1,023
      h 計 ( 税 抜 8%) \\1,143
      消費 税 等 ( 8%) ¥91
      = &1 ¥1,234
      (税率 8% 対 象 ¥1,234)
      (内 消費 税 等 8 え \\91)
      電子 決 済 支 払 ¥1,234
      3 買上 明細 は 上 記 の と お り で す 。
      *] マ ー ク は 軽減 税率 対象 で す 。
      0000002026081512340000000000
      “mEZ 000-000-000-000
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("サンプルストア");
    expect(result.dateCandidates[0]?.value).toBe("2026-08-15");
    expect(result.amountCandidates[0]?.value).toBe(1234);
  });

  it("extracts candidates from high accuracy anonymized OCR text", () => {
    const result = parseReceiptText(`
      7 りり -— 7 a
      x サンプ ルス トア
      mwS TH/E
      5 都 サンプル 区 架空 1ー2ー3
      電話 : 03-0000-0000 レツ
      業者 登録 番号 T0000000000000
      26 年 08 月 15 日 ( 土 ) 12:34 責 t ル
      商品 2 フ "2 つう *120
      EHIUEHEALT * ク 1,023
      計 ( 税 抜 8%) ¥1,143
      消費 税 等 ( 8%) ¥91
      = B1 ¥A1234
      税率 8% 対 象 \\1,234)
      内 消費 税 等 8% ¥91)
      電子決済3Z 支 払 ¥1,234
      買上 明細 は 上 記 の と お り で す 。
      ] マ ー ク は 軽減 税率 対象 で す 。
      0000002026081512340000000000
      |ES  000-000-000-00
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("サンプルストア");
    expect(result.dateCandidates[0]?.value).toBe("2026-08-15");
    expect(result.amountCandidates[0]?.value).toBe(1234);
  });

  it("skips noisy OCR header lines when ranking shop candidates", () => {
    const result = parseReceiptText(`
      / ナ o1 -— リー |
      ァ テスト マーケット
      架空 5 ら 二 上 自 店
      東京都 サンプル 区 架空 1ー2ー3
      電話 : 03-0000-0000 レツ
      業者 登録 番号 T0000000000000
      )26 年 07 月 01 日 ( 水 ) 20:31 担 当
      "商品 A " *168
      h 計 ( 税 抜 8%) \\446
      消費 税 等 ( 8%) ¥35
      = &T ¥481
      電子決済 支 払 ¥481
      買上 明細 は 上 記 の と お り で す 。
      0000002026070120310000000000
      伝票 番号 000-000-000-00
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("ァ テスト マーケット");
    expect(result.dateCandidates[0]?.value).toBe("2026-07-01");
    expect(result.amountCandidates[0]?.value).toBe(481);
  });

  it("combines a brand logo line and branch line as the primary shop candidate", () => {
    const result = parseReceiptText(`
      SAMPLE TEA

      架空新都心店
      架空県架空市中央区
      架空町4丁目267-21F
      000-000-0000

      2026年04月05日(日)       16:37
      DECAF SAMPLE TB10        ¥1,000
      合計                    ¥1,000
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("SAMPLE TEA 架空新都心店");
    expect(result.shopNameCandidates.map((candidate) => candidate.value)).not.toContain("架空新都心店");
    expect(result.dateCandidates[0]?.value).toBe("2026-04-05");
    expect(result.amountCandidates[0]?.value).toBe(1000);
  });

  it("prefers a Japanese brand line over an English logo when building shop candidates", () => {
    const result = parseReceiptText(`
      SAMPLE CONVENIENCE
      7 サンプル-ストア
      架空5丁目店
      架空県架空市架空5-1-32
      電話 : 000-0000-0000
      2026年07月01日 (水) 20:31
      合計 ¥481
    `);

    expect(result.shopNameCandidates[0]?.value).toBe("サンプルストア 架空5丁目店");
    expect(result.shopNameCandidates[1]?.value).toBe("サンプルストア");
    expect(result.amountCandidates[0]?.value).toBe(481);
  });

  it("scores parse results with date, shop, and amount candidates higher", () => {
    const weakResult = parseReceiptText(`
      / ノイズ 1 |
      商品 A 120
    `);
    const strongResult = parseReceiptText(`
      テストマーケット
      2026 年 07 月 01 日
      合計 ¥481
    `);

    expect(scoreReceiptParseResult(strongResult)).toBeGreaterThan(scoreReceiptParseResult(weakResult));
  });
});
