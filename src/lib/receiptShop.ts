import type { ReceiptCandidate } from "../types";
import { normalizeReceiptText } from "./receiptText";

const SHOP_EXCLUDE_PATTERN =
  /(領収|レシート|明細|登録番号|TEL|電話|合計|税込|小計|現計|釣|お預|クレジット|ポイント)/i;
const SHOP_GREETING_PATTERN =
  /^(?:(?:毎度|いつも).*(?:ありがとう|有難う)|(?:ご来店|ご利用|お買い上げ|お買上げ).*(?:ありがとう|有難う))(?:ござい(?:ます|ました))?[。.!！]*$/i;
const SHOP_PHONE_SUFFIX_PATTERN =
  /\s*(?:(?:TEL|電話)\s*[:：]?\s*)?0\d{1,3}\s*(?:[-ー－]|[（(])\s*\d{2,4}\s*(?:[-ー－]|[）)])\s*\d{3,4}\s*$/i;
const SHOP_DATE_PATTERN = /\d{1,4}\s*(?:[\/\-.年])\s*\d{1,2}/;

type ShopLine = {
  value: string;
  line: string;
  index: number;
};

export type ReceiptShopAmountDetector = (line: string) => boolean;

function uniqueCandidates<T>(candidates: Array<ReceiptCandidate<T>>): Array<ReceiptCandidate<T>> {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = String(candidate.value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cleanShopNameLine(line: string): string {
  return line
    .replace(/^[\s\d\-ー―—‐|*/._]+/, "")
    .replace(SHOP_PHONE_SUFFIX_PATTERN, "")
    .trim();
}

function isProbableBranchShopLine(line: string): boolean {
  const compactLine = line.replace(/\s/g, "");
  const japaneseCount = compactLine.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;

  return compactLine.endsWith("店") && japaneseCount >= 3 && !/\s/.test(line);
}

function isAddressLikeShopLine(line: string): boolean {
  return /(都|道|府|県|市|区|町|丁目|番地|住所)/.test(line) && !isProbableBranchShopLine(line);
}

function isProbableLatinBrandLine(line: string): boolean {
  const compactLine = line.replace(/[\s._\-ー―—‐・]/g, "");
  if (compactLine.length < 3 || compactLine.length > 24 || /\d/.test(compactLine)) {
    return false;
  }

  const latinCount = compactLine.match(/[A-Za-z]/g)?.length ?? 0;
  const japaneseCount = compactLine.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;

  return latinCount >= 3 && japaneseCount === 0 && latinCount / compactLine.length >= 0.75;
}

function isProbableJapaneseBrandLine(line: string): boolean {
  const compactLine = line.replace(/\s/g, "");
  const japaneseCount = compactLine.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;

  return japaneseCount >= 3 && !isProbableBranchShopLine(line) && !isAddressLikeShopLine(line);
}

function isNoisyShopNameLine(line: string): boolean {
  const compactLine = line.replace(/\s/g, "");
  if (!compactLine) {
    return true;
  }

  const digitCount = compactLine.match(/\d/g)?.length ?? 0;
  if (digitCount >= 2) {
    return true;
  }

  const symbolCount = compactLine.match(/[-―—‐|#=<>[\]{}()/\\"'“”`~^%$@!?.,:;_+*]/g)?.length ?? 0;
  if (symbolCount / compactLine.length >= 0.25) {
    return true;
  }

  const japaneseCount = compactLine.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;
  const latinCount = compactLine.match(/[A-Za-z]/g)?.length ?? 0;
  return latinCount > 0 && japaneseCount === 0;
}

function canUseShopLine(line: string): boolean {
  return !isNoisyShopNameLine(line) || isProbableLatinBrandLine(line);
}

function normalizeShopNameCandidate(line: string): { value: string; confidenceBoost: number } {
  const cleanedLine = cleanShopNameLine(line);
  const compactLine = cleanedLine.replace(/[\s\-ー―—‐・]/g, "");
  const hasSampleStoreFragments =
    (/サン/.test(compactLine) && /(プル|ブル|フル)/.test(compactLine) && /(ストア|ス卜ア|トア|スト)/.test(compactLine)) ||
    (/(サプ|サンプ|サソプ)/.test(compactLine) && /(ス卜|スト|トア)/.test(compactLine));

  if (hasSampleStoreFragments) {
    return {
      value: "サンプルストア",
      confidenceBoost: 0.35,
    };
  }

  return {
    value: cleanedLine,
    confidenceBoost: 0,
  };
}

function getShopNameConfidence(line: string, sourceIndex: number, confidenceBoost: number): number {
  let confidence = sourceIndex <= 2 ? 0.68 : 0.52;

  if (isProbableJapaneseBrandLine(line)) {
    confidence += 0.2;
  } else if (isProbableLatinBrandLine(line)) {
    confidence += 0.08;
  }

  if (isProbableBranchShopLine(line)) {
    confidence -= 0.2;
  }

  if (isAddressLikeShopLine(line)) {
    confidence -= 0.25;
  }

  return Math.min(0.95, Math.max(0.1, confidence + confidenceBoost));
}

function createCombinedShopCandidates(
  shopLines: ShopLine[],
): Array<ReceiptCandidate<string> & { branchIndex: number }> {
  const candidates: Array<ReceiptCandidate<string> & { branchIndex: number }> = [];

  shopLines.forEach((shopLine, index) => {
    if (!isProbableBranchShopLine(shopLine.value)) {
      return;
    }

    const brandLine = [...shopLines]
      .slice(0, index)
      .reverse()
      .find(
        (candidate) =>
          shopLine.index - candidate.index <= 2 &&
          (isProbableJapaneseBrandLine(candidate.value) || isProbableLatinBrandLine(candidate.value)),
      );

    if (!brandLine) {
      return;
    }

    const normalizedBrandLine = normalizeShopNameCandidate(brandLine.value).value;
    const normalizedBranchLine = normalizeShopNameCandidate(shopLine.value).value;
    const combinedValue = `${normalizedBrandLine} ${normalizedBranchLine}`;
    candidates.push({
      value: combinedValue,
      label: combinedValue,
      line: `${brandLine.line} / ${shopLine.line}`,
      confidence: isProbableJapaneseBrandLine(brandLine.value) ? 0.97 : 0.94,
      branchIndex: shopLine.index,
    });
  });

  return candidates;
}

export function extractShopNameCandidates(
  lines: readonly string[],
  containsAmount: ReceiptShopAmountDetector,
): Array<ReceiptCandidate<string>> {
  const shopLines: ShopLine[] = lines
    .map((line, index) => ({
      value: cleanShopNameLine(normalizeReceiptText(line).trim()),
      line: normalizeReceiptText(line).trim(),
      index,
    }))
    .filter((shopLine) => shopLine.value.length >= 2)
    .filter((shopLine) => shopLine.value.length <= 32)
    .filter((shopLine) => !SHOP_EXCLUDE_PATTERN.test(shopLine.value))
    .filter((shopLine) => !SHOP_GREETING_PATTERN.test(shopLine.value))
    .filter((shopLine) => !SHOP_DATE_PATTERN.test(shopLine.value))
    .filter((shopLine) => !containsAmount(shopLine.value))
    .filter((shopLine) => canUseShopLine(shopLine.value));

  const combinedCandidates = createCombinedShopCandidates(shopLines);
  const combinedBranchIndexes = new Set(combinedCandidates.map((candidate) => candidate.branchIndex));
  const singleLineCandidates = shopLines
    .filter((shopLine) => !combinedBranchIndexes.has(shopLine.index))
    .filter((shopLine) => !isAddressLikeShopLine(shopLine.value))
    .map((shopLine) => {
      const normalizedCandidate = normalizeShopNameCandidate(shopLine.value);
      const confidence = getShopNameConfidence(
        normalizedCandidate.value,
        shopLine.index,
        normalizedCandidate.confidenceBoost,
      );
      return {
        value: normalizedCandidate.value,
        label: normalizedCandidate.value,
        line: shopLine.line,
        confidence,
      };
    });

  return uniqueCandidates([...combinedCandidates, ...singleLineCandidates].sort(
    (a, b) => b.confidence - a.confidence,
  )).slice(0, 5);
}
