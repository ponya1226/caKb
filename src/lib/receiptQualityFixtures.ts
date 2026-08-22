import type { OcrTextBlock } from "../types";

export type ReceiptQualityFixtureLineItem = readonly [name: string, amount: number];

export const RECEIPT_STRUCTURE_FEATURES = [
  "item-same-line",
  "item-split-line",
  "subtotal-tax",
  "split-payable-total",
  "payment",
  "change",
  "stored-value-balance",
  "numeric-footer",
  "column-reordered",
  "partial-ocr",
] as const;

export type ReceiptStructureFeature = typeof RECEIPT_STRUCTURE_FEATURES[number];

export type ReceiptQualityFixture = {
  id: string;
  name: string;
  layoutFamily: "convenience" | "supermarket" | "specialty" | "grocery" | "home-center" | "partial";
  structureFeatures: readonly ReceiptStructureFeature[];
  ocrText: string;
  ocrBlocks?: OcrTextBlock[];
  expectedTotal: number | null;
  expectedShopName?: string | null;
  expectedLineItems: readonly ReceiptQualityFixtureLineItem[];
  expectedExcludedAmounts?: readonly number[];
  expectedDecision: "autoSave" | "needsReview";
};

const longGroceryProducts = Array.from({ length: 25 }, (_, index) => {
  const itemNumber = `${index + 1}`.padStart(2, "0");
  return {
    text: `01 商品${itemNumber} ¥${100 + index}`,
    lineItem: [`商品${itemNumber}`, 100 + index] as const,
  };
});

function createPositionedReceiptLines(lines: readonly string[]): OcrTextBlock[] {
  return lines.map((line, index) => ({
    text: line,
    granularity: "word",
    boundingBox: {
      x: 20,
      y: 20 + index * 28,
      width: Math.max(40, line.length * 12),
      height: 20,
    },
  }));
}

export const RECEIPT_QUALITY_FIXTURES: readonly ReceiptQualityFixture[] = [
  {
    id: "convenience-balance",
    name: "電子マネー残高を含む単品コンビニ",
    layoutFamily: "convenience",
    structureFeatures: [
      "item-same-line",
      "subtotal-tax",
      "payment",
      "stored-value-balance",
      "numeric-footer",
    ],
    ocrText: `
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
      ¥31)
      (10%対象
      ¥348)
      (内消費税額
      ¥31)
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
      会員ランク
      レギュラー
      ¥999
    `,
    expectedTotal: 348,
    expectedShopName: "SAMPLE CONVENIENCE サンプル駅店",
    expectedLineItems: [["やわらかロングタオルブルー", 348]],
    expectedExcludedAmounts: [1494, 999],
    expectedDecision: "needsReview",
  },
  {
    id: "convenience-standard",
    name: "商品と金額が別行のコンビニ",
    layoutFamily: "convenience",
    structureFeatures: ["item-split-line", "subtotal-tax", "payment", "numeric-footer"],
    ocrText: `
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
    `,
    expectedTotal: 481,
    expectedShopName: "サンプルコンビニ 架空1丁目店",
    expectedLineItems: [
      ["ポテトチップス うすしお味", 168],
      ["長芋わさび醤油仕立て", 278],
    ],
    expectedDecision: "autoSave",
  },
  {
    id: "supermarket-tax-exclusive",
    name: "外税と釣銭を含むスーパー",
    layoutFamily: "supermarket",
    structureFeatures: ["item-same-line", "subtotal-tax", "payment", "change", "numeric-footer"],
    ocrText: `
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
    `,
    expectedTotal: 170,
    expectedShopName: "SAMPLE MARKET サンプル団地店",
    expectedLineItems: [["ベーキングパウダー", 158]],
    expectedExcludedAmounts: [1020, 850],
    expectedDecision: "autoSave",
  },
  {
    id: "specialty-tax-summary",
    name: "販促日付と税区分を含む専門店",
    layoutFamily: "specialty",
    structureFeatures: ["item-same-line", "subtotal-tax", "payment", "change"],
    ocrText: `
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
    `,
    expectedTotal: 1000,
    expectedShopName: "SAMPLE TEA 架空新都心店",
    expectedLineItems: [["DECAF SAMPLE TB10", 1000]],
    expectedDecision: "autoSave",
  },
  {
    id: "grocery-split-discount",
    name: "改行商品と割引を含む食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-split-line", "subtotal-tax", "payment", "change", "numeric-footer"],
    ocrText: `
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
    `,
    expectedTotal: 1746,
    expectedShopName: "SAMPLE GROCERY 架空店",
    expectedLineItems: [
      ["きゃべつ", 159],
      ["レタス", 119],
      ["ミニトマト (大パック", 359],
      ["割引(20%)", -60],
      ["国産若鶏むね肉 2枚", 741],
      ["生ハム 110g", 299],
    ],
    expectedExcludedAmounts: [2000, 254],
    expectedDecision: "autoSave",
  },
  {
    id: "grocery-long",
    name: "25品目の長い食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-same-line", "subtotal-tax"],
    ocrText: `
      SAMPLE GROCERY
      架空店
      2026年07月03日 (金) 14:34
      ${longGroceryProducts.map((product) => product.text).join("\n")}
      小計 25点 ¥2,800
      合計 ¥3,024
    `,
    expectedTotal: 3024,
    expectedLineItems: longGroceryProducts.map((product) => product.lineItem),
    expectedDecision: "needsReview",
  },
  {
    id: "grocery-subtotal-residual",
    name: "小計差分で1品を補完する食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-same-line", "subtotal-tax"],
    ocrText: `
      SAMPLE GROCERY
      架空店
      2026年08月08日 12:01
      01 商品A ¥100
      01 商品B
      小計 2点 ¥300
      外税8% ¥24
      合計 ¥324
    `,
    expectedTotal: 324,
    expectedLineItems: [
      ["商品A", 100],
      ["商品B", 200],
    ],
    expectedDecision: "needsReview",
  },
  {
    id: "grocery-ambiguous-pair",
    name: "複数商品と複数金額が分離した食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-split-line", "subtotal-tax", "column-reordered"],
    ocrText: `
      SAMPLE GROCERY
      架空店
      2026年08月08日 12:01
      01 商品A
      01 商品B
      ¥100
      ¥200
      小計 2点 ¥300
      外税8% ¥24
      合計 ¥324
    `,
    expectedTotal: 324,
    expectedLineItems: [
      ["商品A", 100],
      ["商品B", 200],
    ],
    expectedDecision: "needsReview",
  },
  {
    id: "grocery-column-batch",
    name: "5品目の名前列と金額列が分離した食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-split-line", "subtotal-tax", "column-reordered"],
    ocrText: `
      SAMPLE GROCERY
      架空店
      2026年08月16日 12:00
      01 商品A
      04 商品B
      05 商品C
      06 商品D
      07 商品E
      ¥100
      ¥200
      ¥300
      ¥400
      ¥500
      小計
      5点 ¥1,500
      外税8% ¥120
      合計 ¥1,620
    `,
    expectedTotal: 1620,
    expectedLineItems: [
      ["商品A", 100],
      ["商品B", 200],
      ["商品C", 300],
      ["商品D", 400],
      ["商品E", 500],
    ],
    expectedDecision: "needsReview",
  },
  {
    id: "tax-prefixed-grocery-ticket-time",
    name: "会計券時刻と税区分前置の商品コードを含む食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-same-line", "subtotal-tax", "payment", "change"],
    ocrText: `
      毎度ありがとうございます。
      SAMPLE FOOD STORE
      文化サンプル
      架空店 00(0000)9876
      登録番号 T0000000000000
      2026年8月16日 (日) 18:17 #000006
      005756精算機6
      2175
      お会計券 #000104 R4037 18:16
      005778 担当者
      外8 0012* 商品A* ¥498
      外8 0012 商品B ¥298
      外8 0015 商品C ¥448
      外8 0021 商品D ¥350
      外8 0022 商品E ¥320
      外8 0024 商品F ¥298
      外10 0041 商品G ¥5
      小計
      ¥2,217
      外税額 8% ¥176
      外税額 10% ¥0
      買上点数 7点
      合計
      (税率 8%対象額
      (内消費税等 8%
      (税率10%対象額
      ¥2,393
      ¥2,388)
      ¥176)
      ¥5)
      (内消費税等10%
      お預り
      ¥0)
      ¥2,824
      お釣り
      ¥431
    `,
    expectedTotal: 2393,
    expectedShopName: "文化サンプル 架空店",
    expectedLineItems: [
      ["商品A", 498],
      ["商品B", 298],
      ["商品C", 448],
      ["商品D", 350],
      ["商品E", 320],
      ["商品F", 298],
      ["商品G", 5],
    ],
    expectedExcludedAmounts: [16, 9876, 100041, 2824, 431],
    expectedDecision: "needsReview",
  },
  {
    id: "grocery-tax-marked-department-code",
    name: "記号付き部門コードと改行金額を含む食品スーパー",
    layoutFamily: "grocery",
    structureFeatures: ["item-split-line", "item-same-line", "subtotal-tax", "payment", "change"],
    ocrText: `
      SAMPLE GROCERY
      架空新田店
      000-0000-0000
      2026年08月16日 (日) 10:21
      店: 0000 レジ No:0000
      01 *商品A
      ¥259
      01 *商品B
      ¥259
      01 *商品C
      ¥398
      (@199 x 2個)
      03* (冷凍) 商品D
      ¥499
      05 商品E
      ¥109
      05 *商品F ¥799
      05 商品G ¥209
      05 *商品H ¥399
      06 商品I ¥269
      06 商品J
      ¥199
      07 商品K 特 ¥252
      (084 x 3個)
      07 商品L 特 ¥478
      07 *商品M ¥199
      07 商品N ¥399
      07 商品O ¥229
      13 *商品P ¥119
      13 商品Q 特 ¥100
      20点 ¥5,175
      小計
      税込金額合計
      ¥5,591
      10%税抜対象額 ¥100
      10%税額 ¥10
      8%税抜対象額 ¥5,075
      8%税額 ¥406
      お買上計 ¥5,591
      お預り計 ¥10,141
      お釣り ¥4,550
    `,
    expectedTotal: 5591,
    expectedShopName: "SAMPLE GROCERY 架空新田店",
    expectedLineItems: [
      ["商品A", 259],
      ["商品B", 259],
      ["商品C", 398],
      ["(冷凍) 商品D", 499],
      ["商品E", 109],
      ["商品F", 799],
      ["商品G", 209],
      ["商品H", 399],
      ["商品I", 269],
      ["商品J", 199],
      ["商品K 特", 252],
      ["商品L 特", 478],
      ["商品M", 199],
      ["商品N", 399],
      ["商品O", 229],
      ["商品P", 119],
      ["商品Q 特", 100],
    ],
    expectedExcludedAmounts: [3, 10141, 4550],
    expectedDecision: "autoSave",
  },
  {
    id: "home-center-column-order",
    name: "商品金額列と会員情報が本文末尾へ移動したホームセンター",
    layoutFamily: "home-center",
    structureFeatures: [
      "item-same-line",
      "subtotal-tax",
      "payment",
      "change",
      "numeric-footer",
      "column-reordered",
    ],
    ocrText: `
      SAMPLE HOME
      ホームセンター サンプル
      サンプル株式会社
      登録番号 T0000000000000
      領収証
      架空5丁目店 TEL 000-0000-0000
      2026年 8月16日 (日) 11:12
      0005 浴用肌洗い ¥698
      0000000000001
      #0012 有機むき甘栗 ¥98
      0000000000002
      0016 A糸ようじコンパクト ¥598
      0000000000003
      0005 足元BM 75IV
      0000000000004
      0016 エリエール18R
      0000000000005
      0016 リステリンCMO
      0000000000006
      小計
      6点
      (外税 10.0% 対象額
      10.0% 消費税等
      (外税 8.0%対象額
      8.0% 消費税等
      外税計
      ¥1,980
      ¥928
      ¥1,180
      ¥5,482
      ¥5,384)
      ¥538
      ¥98)
      ¥7
      ¥545
      現計
      ¥6,027
      お預り
      ¥10,100
      お釣り
      ¥4,073
      ポイント対象金額
      今回獲得総ポイント
      ¥5,482
      27 P
      次ランクまであと
      ¥39,478
      次ランク
      ゴールド
    `,
    ocrBlocks: createPositionedReceiptLines([
      "SAMPLE HOME",
      "ホームセンター サンプル",
      "サンプル株式会社",
      "登録番号 T0000000000000",
      "領収証",
      "架空5丁目店 TEL 000-0000-0000",
      "2026年 8月16日 (日) 11:12",
      "0005 浴用肌洗い ¥698",
      "0000000000001",
      "#0012 有機むき甘栗 ¥98",
      "0000000000002",
      "0016 A糸ようじコンパクト ¥598",
      "0000000000003",
      "0005 足元BM 75IV ¥1,980",
      "0000000000004",
      "0016 エリエール18R ¥928",
      "0000000000005",
      "0016 リステリンCMO ¥1,180",
      "0000000000006",
      "小計 6点 ¥5,482",
      "(外税 10.0% 対象額 ¥5,384)",
      "10.0% 消費税等 ¥538",
      "(外税 8.0%対象額 ¥98)",
      "8.0% 消費税等 ¥7",
      "外税計 ¥545",
      "現計 ¥6,027",
      "お預り ¥10,100",
      "お釣り ¥4,073",
      "ポイント対象金額 ¥5,482",
      "今回獲得総ポイント 27 P",
      "次ランクまであと ¥39,478",
      "次ランク ゴールド",
    ]),
    expectedTotal: 6027,
    expectedLineItems: [
      ["浴用肌洗い", 698],
      ["有機むき甘栗", 98],
      ["A糸ようじコンパクト", 598],
      ["足元BM 75IV", 1980],
      ["エリエール18R", 928],
      ["リステリンCMO", 1180],
    ],
    expectedExcludedAmounts: [10100, 4073, 39478],
    expectedDecision: "needsReview",
  },
  {
    id: "home-center-split-prices-partial-layout",
    name: "品目金額が別行と小計後へ分離したホームセンター",
    layoutFamily: "home-center",
    structureFeatures: [
      "item-split-line",
      "subtotal-tax",
      "payment",
      "change",
      "numeric-footer",
      "column-reordered",
    ],
    ocrText: `
      SAMPLE HOME
      ホームセンター サンプル
      サンプル株式会社
      登録番号 T0000000000000
      領収証
      架空5丁目店 TEL 000-0000-0000
      2026年 8月16日 (日) 11:12
      0005 浴用肌洗い
      ¥698
      0000000000001
      #0012 有機むき甘栗
      #98
      0000000000002
      0016 A糸ようじコンパクト ¥598
      0000000000003
      0005 足元BM 75IV
      0000000000004
      0016 エリエール18R
      0000000000005
      0016 リステリンCMO
      0000000000006
      小計
      6点
      (外税 10.0% 対象額
      10.0% 消費税等
      (外税 8.0%対象額
      8.0% 消費税等
      外税計
      ¥1,980
      ¥928
      ¥1,180
      ¥5,482
      ¥5,384)
      ¥538
      ¥98)
      ¥7
      ¥545
      現計
      ¥6,027
      お預り
      ¥10,100
      お釣り
      ¥4,073
      会員番号
      会員ランク
      ポイント対象金額
      今回獲得総ポイント
      0000000000000000
      レギュラー
      ¥5,482
      27 P
      次ランクまであと
      ¥39,478
      次ランク
      ゴールド
    `,
    ocrBlocks: createPositionedReceiptLines([
      "SAMPLE HOME",
      "ホームセンター サンプル",
      "サンプル株式会社",
      "登録番号 T0000000000000",
      "領収証",
      "架空5丁目店 TEL 000-0000-0000",
      "2026年 8月16日 (日) 11:12",
      "0005 浴用肌洗い ¥698",
      "0000000000001",
      "#0012 有機むき甘栗",
      "0000000000002",
      "0016 A糸ようじコンパクト ¥598",
      "0000000000003",
      "0005 足元BM 75IV",
      "0000000000004",
      "0016 エリエール18R",
      "0000000000005",
      "0016 リステリンCMO",
      "0000000000006",
      "小計 6点 ¥5,482",
      "(外税 10.0% 対象額 ¥5,384)",
      "10.0% 消費税等 ¥538",
      "(外税 8.0%対象額 ¥98)",
      "8.0% 消費税等 ¥7",
      "外税計 ¥545",
      "現計 ¥6,027",
      "お預り ¥10,100",
      "お釣り ¥4,073",
      "会員ランク",
      "レギュラー ¥5,482",
      "今回獲得総ポイント 27 P",
      "次ランクまであと ¥39,478",
      "次ランク ゴールド",
    ]),
    expectedTotal: 6027,
    expectedLineItems: [
      ["浴用肌洗い", 698],
      ["有機むき甘栗", 98],
      ["A糸ようじコンパクト", 598],
      ["足元BM 75IV", 1980],
      ["エリエール18R", 928],
      ["リステリンCMO", 1180],
    ],
    expectedExcludedAmounts: [10100, 4073, 39478],
    expectedDecision: "needsReview",
  },
  {
    id: "generic-split-total-payment-footer",
    name: "分割合計と決済後の数値フッターを含む匿名レシート",
    layoutFamily: "supermarket",
    structureFeatures: [
      "item-same-line",
      "subtotal-tax",
      "split-payable-total",
      "payment",
      "change",
      "numeric-footer",
    ],
    ocrText: `
      SAMPLE MARKET
      架空中央店
      2026年08月16日 (日) 12:00
      商品A ¥300
      小計 ¥300
      合
      計
      ¥300
      現金 ¥500
      お釣り ¥200
      会員ランク
      レギュラー
      次ランクまであと
      ¥10,000
    `,
    expectedTotal: 300,
    expectedLineItems: [["商品A", 300]],
    expectedExcludedAmounts: [500, 200, 10000],
    expectedDecision: "autoSave",
  },
  {
    id: "generic-tax-total-card-footer",
    name: "税込合計とカード決済後のポイント金額を含む匿名レシート",
    layoutFamily: "specialty",
    structureFeatures: ["item-same-line", "subtotal-tax", "payment", "numeric-footer"],
    ocrText: `
      SAMPLE SHOP
      架空駅前店
      2026年08月16日 (日) 13:00
      商品A ¥800
      商品B ¥200
      小計 ¥1,000
      消費税 ¥100
      税込金額合計 ¥1,100
      クレジット ¥1,100
      カードNo SAMPLE-0000
      ポイント対象金額 ¥1,000
      今回ポイント 10P
      次ランクまであと ¥9,000
    `,
    expectedTotal: 1100,
    expectedLineItems: [
      ["商品A", 800],
      ["商品B", 200],
    ],
    expectedExcludedAmounts: [9000],
    expectedDecision: "autoSave",
  },
  {
    id: "generic-split-total-stored-value-balance",
    name: "分割お買上計と電子マネー残高を含む匿名レシート",
    layoutFamily: "convenience",
    structureFeatures: [
      "item-same-line",
      "subtotal-tax",
      "split-payable-total",
      "payment",
      "stored-value-balance",
      "numeric-footer",
    ],
    ocrText: `
      SAMPLE TRANSIT STORE
      架空改札前店
      2026年08月16日 (日) 14:00
      商品B ¥780
      小計 ¥780
      お買上
      計 ¥780
      交通系マネー ¥780
      交通系マネー残高は以下の通りです。
      支払後残高 ¥2,220
      カードNo SAMPLE-1111
    `,
    expectedTotal: 780,
    expectedLineItems: [["商品B", 780]],
    expectedExcludedAmounts: [2220, 1111],
    expectedDecision: "needsReview",
  },
  {
    id: "missing-date",
    name: "利用日がない読み取り結果",
    layoutFamily: "partial",
    structureFeatures: ["item-same-line", "partial-ocr"],
    ocrText: `
      SAMPLE STORE
      商品A ¥500
      合計 ¥500
    `,
    expectedTotal: 500,
    expectedShopName: "SAMPLE STORE",
    expectedLineItems: [["商品A", 500]],
    expectedDecision: "needsReview",
  },
  {
    id: "missing-merchant",
    name: "店舗名がない読み取り結果",
    layoutFamily: "partial",
    structureFeatures: ["subtotal-tax", "partial-ocr"],
    ocrText: `
      2026年08月08日
      合計 ¥500
    `,
    expectedTotal: 500,
    expectedShopName: null,
    expectedLineItems: [],
    expectedDecision: "needsReview",
  },
  {
    id: "partial-ocr",
    name: "文字が不足した読み取り結果",
    layoutFamily: "partial",
    structureFeatures: ["partial-ocr"],
    ocrText: "合計",
    expectedTotal: null,
    expectedLineItems: [],
    expectedDecision: "needsReview",
  },
];
