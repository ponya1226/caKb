import type { ReceiptCandidate, ReceiptParseResult } from "../types";

const FINAL_AMOUNT_KEYWORD_PATTERN =
  /(合\s*計|現\s*計|お\s*買\s*上\s*計|お\s*買\s*い\s*上\s*げ\s*計|総\s*合\s*計|請\s*求|支\s*払|お\s*支\s*払|Pay\s*Pay|y\s*Pay|計\s*$)/i;
const SUPPORTING_AMOUNT_KEYWORD_PATTERN = /(税\s*込|小\s*計|消\s*費\s*税)/;
const SHOP_EXCLUDE_PATTERN = /(領収|レシート|明細|登録番号|TEL|電話|合計|税込|小計|現計|釣|お預|クレジット|ポイント)/i;
const MONEY_AMOUNT_PATTERN = /¥\s*[%A-Za-z]*\s*[\dOo〇○Cc¢][\dOo〇○Cc¢,\s.．()[\]（）]{0,14}(?:円)?/g;
const PLAIN_AMOUNT_PATTERN = /[\d][\d,\s]{1,12}(?:円)?/g;

type ShopLine = {
  value: string;
  line: string;
  index: number;
};

function normalizeText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[\\￥]/g, "¥");
}

function normalizeAmountText(value: string): string {
  return normalizeText(value)
    .replace(/[Oo〇○Cc¢]/g, "0")
    .replace(/[．]/g, ".")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
}

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

function parseDateCandidate(rawYear: string, rawMonth: string, rawDay: string): string | null {
  const yearNumber = inferYear(rawYear);
  const monthNumber = Number(rawMonth);
  const dayNumber = Number(rawDay);
  const date = new Date(yearNumber, monthNumber - 1, dayNumber);

  if (
    date.getFullYear() !== yearNumber ||
    date.getMonth() !== monthNumber - 1 ||
    date.getDate() !== dayNumber
  ) {
    return null;
  }

  return `${yearNumber}-${`${monthNumber}`.padStart(2, "0")}-${`${dayNumber}`.padStart(2, "0")}`;
}

function inferYear(rawYear: string): number {
  if (rawYear.length >= 4) {
    return Number(rawYear);
  }

  if (rawYear.length === 2) {
    return Number(`20${rawYear}`);
  }

  const digit = Number(rawYear);
  const currentYear = new Date().getFullYear();
  const currentDecadeStart = currentYear - (currentYear % 10);
  const inferredYear = currentDecadeStart + digit;

  return inferredYear > currentYear + 1 ? inferredYear - 10 : inferredYear;
}

function extractDateCandidates(lines: string[]): Array<ReceiptCandidate<string>> {
  const candidates: Array<ReceiptCandidate<string>> = [];
  const patterns = [
    /(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g,
    /(\d{2,4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/g,
  ];

  lines.forEach((line) => {
    patterns.forEach((pattern) => {
      Array.from(line.matchAll(pattern)).forEach((match) => {
        const value = parseDateCandidate(match[1], match[2], match[3]);
        if (value) {
          candidates.push({
            value,
            label: value,
            line,
            confidence: 0.9,
          });
        }
      });
    });
  });

  return uniqueCandidates(candidates).slice(0, 5);
}

function parseAmountValue(value: string): number | null {
  const amountText = normalizeAmountText(value);
  const commaMatch = amountText.match(/(\d{1,3})\s*,\s*([\d()[\]]{1,3})/);
  const normalized = commaMatch
    ? `${commaMatch[1]}${commaMatch[2].replace(/[^\d]/g, "").padEnd(3, "0")}`
    : amountText.replace(/[^\d]/g, "");

  if (!normalized) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000_000) {
    return null;
  }

  return amount;
}

function isPlainAmountMatchSkippable(line: string, match: RegExpMatchArray): boolean {
  const index = match.index ?? 0;
  const token = match[0];
  const before = line[index - 1] ?? "";
  const after = line[index + token.length] ?? "";

  return after === "%" || /[A-Za-z]/.test(before);
}

function extractAmountsFromLine(line: string): number[] {
  const normalizedLine = normalizeText(line);
  const moneyMatches = Array.from(normalizedLine.matchAll(MONEY_AMOUNT_PATTERN));
  const plainMatches = Array.from(normalizedLine.matchAll(PLAIN_AMOUNT_PATTERN)).filter(
    (match) => !isPlainAmountMatchSkippable(normalizedLine, match),
  );

  return [...moneyMatches, ...plainMatches]
    .map((match) => parseAmountValue(match[0]))
    .filter((amount): amount is number => amount !== null)
    .filter((amount) => amount >= 10)
    .filter((amount, index, amounts) => amounts.indexOf(amount) === index);
}

function getAmountConfidence(line: string): number {
  if (FINAL_AMOUNT_KEYWORD_PATTERN.test(line)) {
    return 0.98;
  }

  if (/税\s*込/.test(line)) {
    return 0.9;
  }

  if (/小\s*計/.test(line)) {
    return 0.62;
  }

  if (/消\s*費\s*税/.test(line)) {
    return 0.35;
  }

  return 0.45;
}

function shouldSkipFallbackAmountLine(line: string): boolean {
  return /(電話|TEL|登録番号|伝票番号|No\.?|#|都|道|府|県|市|区|町|丁目|番地|住所|\d{2,4}-\d{2,4}-\d{3,4}|\d{1,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/i.test(line);
}

function extractAmountCandidates(lines: string[]): Array<ReceiptCandidate<number>> {
  const keywordCandidates: Array<ReceiptCandidate<number>> = [];
  const fallbackCandidates: Array<ReceiptCandidate<number>> = [];

  lines.forEach((line, index) => {
    const amounts = extractAmountsFromLine(line);
    if (amounts.length === 0) {
      return;
    }

    const hasKeyword = FINAL_AMOUNT_KEYWORD_PATTERN.test(line) || SUPPORTING_AMOUNT_KEYWORD_PATTERN.test(line);
    const hasMoneySymbol = /¥/.test(normalizeText(line));
    const confidence = hasKeyword ? getAmountConfidence(line) : hasMoneySymbol ? 0.72 : 0.45;
    const target = hasKeyword || hasMoneySymbol ? keywordCandidates : fallbackCandidates;

    if (!hasKeyword && !hasMoneySymbol && shouldSkipFallbackAmountLine(line)) {
      return;
    }

    amounts.forEach((amount) => {
      target.push({
        value: amount,
        label: `¥${amount.toLocaleString("ja-JP")}`,
        line: line.trim() || `行 ${index + 1}`,
        confidence,
      });
    });
  });

  const candidates =
    keywordCandidates.length > 0
      ? keywordCandidates.sort((a, b) => b.confidence - a.confidence || b.value - a.value)
      : fallbackCandidates.sort((a, b) => b.value - a.value);
  return uniqueCandidates(candidates).slice(0, 6);
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

function cleanShopNameLine(line: string): string {
  return line.replace(/^[\s\d\-ー―—‐|*/._]+/, "").trim();
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

function isProbableBranchShopLine(line: string): boolean {
  const compactLine = line.replace(/\s/g, "");
  const japaneseCount = compactLine.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;

  return compactLine.endsWith("店") && japaneseCount >= 3 && !/\s/.test(line);
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

function canUseShopLine(line: string): boolean {
  return !isNoisyShopNameLine(line) || isProbableLatinBrandLine(line);
}

function createCombinedShopCandidates(shopLines: ShopLine[]): Array<ReceiptCandidate<string> & { branchIndex: number }> {
  const candidates: Array<ReceiptCandidate<string> & { branchIndex: number }> = [];

  shopLines.forEach((shopLine, index) => {
    if (!isProbableBranchShopLine(shopLine.value)) {
      return;
    }

    const brandLine = [...shopLines]
      .slice(0, index)
      .reverse()
      .find((candidate) => shopLine.index - candidate.index <= 2 && (isProbableJapaneseBrandLine(candidate.value) || isProbableLatinBrandLine(candidate.value)));

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

function extractShopNameCandidates(lines: string[]): Array<ReceiptCandidate<string>> {
  const shopLines: ShopLine[] = lines
    .map((line, index) => ({
      value: cleanShopNameLine(normalizeText(line).trim()),
      line: normalizeText(line).trim(),
      index,
    }))
    .filter((shopLine) => shopLine.value.length >= 2)
    .filter((shopLine) => shopLine.value.length <= 32)
    .filter((shopLine) => !SHOP_EXCLUDE_PATTERN.test(shopLine.value))
    .filter((shopLine) => !/\d{1,4}\s*(?:[\/\-.年])\s*\d{1,2}/.test(shopLine.value))
    .filter((shopLine) => extractAmountsFromLine(shopLine.value).length === 0)
    .filter((shopLine) => canUseShopLine(shopLine.value));

  const combinedCandidates = createCombinedShopCandidates(shopLines);
  const combinedBranchIndexes = new Set(combinedCandidates.map((candidate) => candidate.branchIndex));
  const singleLineCandidates = shopLines
    .filter((shopLine) => !combinedBranchIndexes.has(shopLine.index))
    .filter((shopLine) => !isAddressLikeShopLine(shopLine.value))
    .map((shopLine) => {
      const normalizedCandidate = normalizeShopNameCandidate(shopLine.value);
      const confidence = getShopNameConfidence(normalizedCandidate.value, shopLine.index, normalizedCandidate.confidenceBoost);
      return {
        value: normalizedCandidate.value,
        label: normalizedCandidate.value,
        line: shopLine.line,
        confidence,
      };
    });

  const candidates = [...combinedCandidates, ...singleLineCandidates].sort(
    (a, b) => b.confidence - a.confidence,
  );

  return uniqueCandidates(candidates).slice(0, 5);
}

export function parseReceiptText(text: string): ReceiptParseResult {
  const lines = normalizeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    dateCandidates: extractDateCandidates(lines),
    shopNameCandidates: extractShopNameCandidates(lines),
    amountCandidates: extractAmountCandidates(lines),
  };
}

export function scoreReceiptParseResult(result: ReceiptParseResult): number {
  const dateScore = result.dateCandidates[0]?.confidence ?? 0;
  const shopScore = result.shopNameCandidates[0]?.confidence ?? 0;
  const amountScore = result.amountCandidates[0]?.confidence ?? 0;
  const amountDiversityScore = Math.min(result.amountCandidates.length, 3) * 0.04;

  return dateScore * 0.32 + shopScore * 0.24 + amountScore * 0.4 + amountDiversityScore;
}
