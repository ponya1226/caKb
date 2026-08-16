import type { OcrTextBlock } from "../types";

export type ReceiptQualityFixtureLineItem = readonly [name: string, amount: number];

export type ReceiptQualityFixture = {
  id: string;
  name: string;
  layoutFamily: "convenience" | "supermarket" | "specialty" | "grocery" | "home-center" | "partial";
  ocrText: string;
  ocrBlocks?: OcrTextBlock[];
  expectedTotal: number | null;
  expectedLineItems: readonly ReceiptQualityFixtureLineItem[];
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
    `,
    expectedTotal: 348,
    expectedLineItems: [["やわらかロングタオルブルー", 348]],
    expectedDecision: "needsReview",
  },
  {
    id: "convenience-standard",
    name: "商品と金額が別行のコンビニ",
    layoutFamily: "convenience",
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
    expectedLineItems: [["ベーキングパウダー", 158]],
    expectedDecision: "autoSave",
  },
  {
    id: "specialty-tax-summary",
    name: "販促日付と税区分を含む専門店",
    layoutFamily: "specialty",
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
    expectedLineItems: [["DECAF SAMPLE TB10", 1000]],
    expectedDecision: "autoSave",
  },
  {
    id: "grocery-split-discount",
    name: "改行商品と割引を含む食品スーパー",
    layoutFamily: "grocery",
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
    expectedLineItems: [
      ["きゃべつ", 159],
      ["レタス", 119],
      ["ミニトマト (大パック", 359],
      ["割引(20%)", -60],
      ["国産若鶏むね肉 2枚", 741],
      ["生ハム 110g", 299],
    ],
    expectedDecision: "autoSave",
  },
  {
    id: "grocery-long",
    name: "25品目の長い食品スーパー",
    layoutFamily: "grocery",
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
    id: "home-center-column-order",
    name: "商品金額列と会員情報が本文末尾へ移動したホームセンター",
    layoutFamily: "home-center",
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
    expectedDecision: "needsReview",
  },
  {
    id: "home-center-split-prices-partial-layout",
    name: "品目金額が別行と小計後へ分離したホームセンター",
    layoutFamily: "home-center",
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
    expectedDecision: "needsReview",
  },
  {
    id: "missing-date",
    name: "利用日がない読み取り結果",
    layoutFamily: "partial",
    ocrText: `
      SAMPLE STORE
      商品A ¥500
      合計 ¥500
    `,
    expectedTotal: 500,
    expectedLineItems: [["商品A", 500]],
    expectedDecision: "needsReview",
  },
  {
    id: "missing-merchant",
    name: "店舗名がない読み取り結果",
    layoutFamily: "partial",
    ocrText: `
      2026年08月08日
      合計 ¥500
    `,
    expectedTotal: 500,
    expectedLineItems: [],
    expectedDecision: "needsReview",
  },
  {
    id: "partial-ocr",
    name: "文字が不足した読み取り結果",
    layoutFamily: "partial",
    ocrText: "合計",
    expectedTotal: null,
    expectedLineItems: [],
    expectedDecision: "needsReview",
  },
];
