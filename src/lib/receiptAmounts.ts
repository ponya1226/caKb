import {
  isReceiptLineItemDiscount,
  normalizeReceiptLineItemName,
} from "./receiptLineItemClassification";
import { normalizeReceiptText as normalizeText } from "./receiptText";

const MONEY_AMOUNT_PATTERN = /¥\s*[%A-Za-z]*\s*[\dOo〇○Cc¢][\dOo〇○Cc¢,\s.．()[\]（）]{0,14}(?:円)?/g;
const PLAIN_AMOUNT_PATTERN = /[\d][\d,\s]{1,12}(?:円)?/g;
const QUANTITY_AMOUNT_CONTEXT_PATTERN = /(g|ｇ|kg|㎏|ml|mL|ＭＬ|枚|個|本|点|袋|パック|連|P|ｐ)$/i;
export const MIN_RECEIPT_LINE_ITEM_AMOUNT = 1;

export type AmountMatch = {
  amount: number;
  raw: string;
  index: number;
  hasMoneySymbol: boolean;
};

function normalizeAmountText(value: string): string {
  return normalizeText(value)
    .replace(/[Oo〇○Cc¢]/g, "0")
    .replace(/[．]/g, ".")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
}

export function parseReceiptAmountValue(value: string): number | null {
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
  const beforeToken = line.slice(0, index).trim();
  const isLeadingItemCode = /^#?\d{1,4}[*※★]?\s+\S/.test(line) && /^#?$/.test(beforeToken);
  const nearbyText = line
    .slice(Math.max(0, index - 3), Math.min(line.length, index + token.length + 4))
    .replace(/\s/g, "");
  const compactToken = token.replace(/[,\s]/g, "");
  const isTimeToken = /\d{1,2}:\d{2}(?::\d{2})?/.test(nearbyText);
  const isTaxCategoryMarker = /^(?:外|内)$/.test(beforeToken) && /^\s*\d{2,4}/.test(line.slice(index + token.length));
  const isTaxPrefixedItemCode = /^(?:外|内)\s*(?:8|10)$/.test(beforeToken);
  const isCombinedTaxPrefixedItemCode =
    /^(?:外|内)$/.test(beforeToken) && /^(?:8|10)\d{2,4}$/.test(compactToken);

  return (
    isTimeToken ||
    isTaxCategoryMarker ||
    isTaxPrefixedItemCode ||
    isCombinedTaxPrefixedItemCode ||
    after === "%" ||
    /[A-Za-z]/.test(before) ||
    /[A-Za-z]/.test(after) ||
    QUANTITY_AMOUNT_CONTEXT_PATTERN.test(beforeToken) ||
    QUANTITY_AMOUNT_CONTEXT_PATTERN.test(after.trimStart().slice(0, 2)) ||
    isLeadingItemCode
  );
}

function uniqueAmountMatches(matches: AmountMatch[]): AmountMatch[] {
  const seen = new Set<number>();
  return matches.filter((match) => {
    if (seen.has(match.amount)) {
      return false;
    }
    seen.add(match.amount);
    return true;
  });
}

export function extractAmountMatchesFromLine(line: string, minimumAmount = 10): AmountMatch[] {
  const normalizedLine = normalizeText(line);
  const moneyMatches = Array.from(normalizedLine.matchAll(MONEY_AMOUNT_PATTERN)).map((match) => ({
    match,
    hasMoneySymbol: true,
  }));
  const plainMatches = Array.from(normalizedLine.matchAll(PLAIN_AMOUNT_PATTERN))
    .filter((match) => !isPlainAmountMatchSkippable(normalizedLine, match))
    .map((match) => ({
      match,
      hasMoneySymbol: false,
    }));

  return uniqueAmountMatches(
    [...moneyMatches, ...plainMatches]
      .map(({ match, hasMoneySymbol }) => {
        const amount = parseReceiptAmountValue(match[0]);
        if (amount === null) {
          return null;
        }

        return {
          amount,
          raw: match[0],
          index: match.index ?? 0,
          hasMoneySymbol,
        };
      })
      .filter((match): match is AmountMatch => match !== null)
      .sort((a, b) => a.index - b.index),
  ).filter((match) => match.amount >= minimumAmount);
}

export function extractLineItemAmountMatchesFromLine(line: string): AmountMatch[] {
  const normalizedLine = normalizeText(line);
  const unsignedMatches = extractAmountMatchesFromLine(normalizedLine, MIN_RECEIPT_LINE_ITEM_AMOUNT);
  const discountMatches = isReceiptLineItemDiscount(normalizedLine) || /^\s*-/.test(normalizedLine)
    ? Array.from(normalizedLine.matchAll(/-\s*[\dOo〇○Cc¢][\dOo〇○Cc¢,\s.．()[\]（）]{0,14}(?:円)?/g))
        .map((match) => {
          const unsignedAmount = parseReceiptAmountValue(match[0]);
          const amount = unsignedAmount === null ? null : -unsignedAmount;
          if (amount === null) {
            return null;
          }

          return {
            amount,
            raw: match[0],
            index: match.index ?? 0,
            hasMoneySymbol: /¥/.test(match[0]),
          };
        })
        .filter((match): match is AmountMatch => match !== null)
    : [];

  return uniqueAmountMatches([...unsignedMatches, ...discountMatches].sort((a, b) => a.index - b.index)).filter(
    (match) => Math.abs(match.amount) >= MIN_RECEIPT_LINE_ITEM_AMOUNT,
  );
}

export function extractAmountsFromLine(line: string, minimumAmount = 10): number[] {
  return extractAmountMatchesFromLine(line, minimumAmount)
    .map((match) => match.amount)
    .filter((amount) => amount >= minimumAmount)
    .filter((amount, index, amounts) => amounts.indexOf(amount) === index);
}

function removeAmountToken(line: string, match: AmountMatch): string {
  return `${line.slice(0, match.index)} ${line.slice(match.index + match.raw.length)}`;
}

export function cleanLineItemName(line: string, match: AmountMatch): string {
  return normalizeReceiptLineItemName(removeAmountToken(normalizeText(line), match));
}

export function isLineItemAmountOnlyLine(line: string, match: AmountMatch): boolean {
  if (/^\s*-/.test(normalizeText(line))) {
    return false;
  }

  const residualName = cleanLineItemName(line, match);
  return residualName.length === 0 || /^(?:特|特価)$/.test(residualName);
}

export function isDiscountAmountOnlyLine(line: string, match: AmountMatch): boolean {
  return match.amount < 0 && cleanLineItemName(line, match).length === 0;
}

export function shouldSkipSuppressedAmountLine(line: string, match: AmountMatch): boolean {
  const normalizedLine = normalizeText(line).trim();
  const residualName = cleanLineItemName(line, match);

  return normalizedLine.startsWith("¥") || residualName.length <= 3;
}

export function getLineItemConfidence(line: string, match: AmountMatch): number {
  let confidence = match.hasMoneySymbol ? 0.78 : 0.6;

  if (/[*※]/.test(line)) {
    confidence += 0.08;
  }

  if (match.index > line.length * 0.45) {
    confidence += 0.08;
  }

  return Math.min(confidence, 0.94);
}
