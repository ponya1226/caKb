import { describe, expect, it } from "vitest";
import { extractShopNameCandidates } from "./receiptShop";

const containsAmount = (line: string) => /[¥\\￥]\s*\d/.test(line);

describe("extractShopNameCandidates", () => {
  it.each([
    {
      name: "来店挨拶と括弧電話を含む食品スーパー",
      lines: [
        "毎度ありがとうございます。",
        "フレッシュフードストア",
        "1 文化サンプル",
        "架空店 00(0000)9876",
        "登録番号 T0000000000000",
      ],
      expected: "文化サンプル 架空店",
    },
    {
      name: "英字ブランドと支店",
      lines: ["SAMPLE TEA", "架空新都心店", "架空県架空市中央区", "000-000-0000"],
      expected: "SAMPLE TEA 架空新都心店",
    },
    {
      name: "日本語ブランドとTEL付き支店",
      lines: ["サンプルストア", "架空5丁目店 TEL 000-0000-0000", "領収証"],
      expected: "サンプルストア 架空5丁目店",
    },
  ])("$nameのブランド名と支店名を結合する", ({ lines, expected }) => {
    expect(extractShopNameCandidates(lines, containsAmount)[0]?.value).toBe(expected);
  });

  it("一般的な挨拶だけを店舗候補にしない", () => {
    const candidates = extractShopNameCandidates([
      "いつもご利用ありがとうございます。",
      "架空県架空市中央区1-2-3",
      "電話 000-0000-0000",
      "領収証",
    ], containsAmount);

    expect(candidates).toEqual([]);
  });
});
