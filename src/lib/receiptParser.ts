import type { OcrTextBlock, ReceiptCandidate, ReceiptLineItemCandidate, ReceiptParseResult } from "../types";
import {
  ReceiptLineItemAssociator,
  type PendingReceiptLineItemName,
} from "./receiptLineItemAssociation";
import {
  createPendingReceiptDiscountName,
  createPendingReceiptLineItemName,
  isPotentialReceiptLineItemNameLine,
  isReceiptAmountSectionLabel,
  isReceiptLineItemDiscount,
  isReceiptLineItemDiscountMarker,
  isReceiptMarkerLine,
  isUsableReceiptLineItemName,
  normalizeReceiptLineItemName,
  shouldSkipReceiptLineItemLine,
} from "./receiptLineItemClassification";
import {
  detectReceiptLineItemProfile,
  hasReceiptLineItemCode,
  type ReceiptLineItemProfile,
} from "./receiptLineItemProfiles";
import {
  reconcileReceiptLineItems,
  type ReceiptLineItemReconciliationAmount,
} from "./receiptLineItemReconciliation";
import { selectReceiptLineItemCandidates } from "./receiptLineItemSelection";
import { extractShopNameCandidates } from "./receiptShop";
import {
  findAmountCandidateEndIndex,
  getReceiptStructureBoundary,
  isLineItemReconciliationBoundary,
  isReceiptTaxAmountLine,
  isReceiptTaxBaseAmountLine,
  isReceiptTaxSummaryLine,
  isReceiptTaxTotalLine,
} from "./receiptStructure";
import { normalizeReceiptText as normalizeText } from "./receiptText";

const FINAL_AMOUNT_KEYWORD_PATTERN =
  /(合\s*計|現\s*計|お\s*買\s*上\s*計|お\s*買\s*い\s*上\s*げ\s*計|総\s*合\s*計|総\s*計|総\s*額|お\s*会\s*計(?!\s*券)|ご?\s*請\s*求(?:\s*額)?|支\s*払(?:い)?(?:\s*額)?|お\s*支\s*払(?:い)?(?:\s*額)?|決\s*済\s*額|Pay\s*Pay|y\s*Pay|^\s*計(?:\s*¥?\s*[\d,.\s]+)?\s*$)/i;
const SUPPORTING_AMOUNT_KEYWORD_PATTERN = /(税\s*込|小\s*計|消\s*費\s*税)/;
const CASH_TENDERED_KEYWORD_PATTERN = /(現\s*金|お\s*預|預\s*り)/;
const CHANGE_AMOUNT_KEYWORD_PATTERN = /(お\s*釣|おつり|釣\s*り|釣銭)/;
const BALANCE_AMOUNT_KEYWORD_PATTERN = /(残\s*高|利用\s*可能\s*額)/;
const LOYALTY_AMOUNT_KEYWORD_PATTERN =
  /(ポイント\s*対象\s*金\s*額|今回\s*獲得|獲得\s*総\s*ポイント|累計\s*ポイント|次\s*ランク\s*まで|会員\s*ランク|ランク\s*保証)/i;
const MONEY_AMOUNT_PATTERN = /¥\s*[%A-Za-z]*\s*[\dOo〇○Cc¢][\dOo〇○Cc¢,\s.．()[\]（）]{0,14}(?:円)?/g;
const PLAIN_AMOUNT_PATTERN = /[\d][\d,\s]{1,12}(?:円)?/g;
const QUANTITY_AMOUNT_CONTEXT_PATTERN = /(g|ｇ|kg|㎏|ml|mL|ＭＬ|枚|個|本|点|袋|パック|連|P|ｐ)$/i;
const MAX_LINE_ITEM_CANDIDATES = 50;
const MIN_LINE_ITEM_AMOUNT = 1;

type AmountMatch = {
  amount: number;
  raw: string;
  index: number;
  hasMoneySymbol: boolean;
};

type PositionedOcrWord = {
  text: string;
  x: number;
  y: number;
  height: number;
  centerY: number;
};

type SpatialOcrLine = {
  words: PositionedOcrWord[];
  top: number;
  bottom: number;
  centerY: number;
};

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
}

function toPositionedOcrWords(blocks: OcrTextBlock[] | undefined): PositionedOcrWord[] {
  return (blocks ?? [])
    .filter((block) => block.granularity === "word" && Boolean(block.boundingBox))
    .map((block) => {
      const boundingBox = block.boundingBox;
      if (!boundingBox) {
        return null;
      }

      const text = normalizeText(block.text).trim();
      const height = Math.max(1, boundingBox.height);
      if (!text) {
        return null;
      }

      return {
        text,
        x: boundingBox.x,
        y: boundingBox.y,
        height,
        centerY: boundingBox.y + height / 2,
      };
    })
    .filter((word): word is PositionedOcrWord => word !== null);
}

function addWordToSpatialLine(line: SpatialOcrLine, word: PositionedOcrWord): void {
  line.words.push(word);
  line.top = Math.min(line.top, word.y);
  line.bottom = Math.max(line.bottom, word.y + word.height);
  line.centerY = line.words.reduce((sum, item) => sum + item.centerY, 0) / line.words.length;
}

function getVerticalOverlapRatio(line: SpatialOcrLine, word: PositionedOcrWord): number {
  const overlap = Math.max(0, Math.min(line.bottom, word.y + word.height) - Math.max(line.top, word.y));
  return overlap / Math.max(1, Math.min(line.bottom - line.top, word.height));
}

function joinSpatialWords(words: PositionedOcrWord[]): string {
  return [...words]
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text)
    .join(" ");
}

function reconstructSpatialTextLines(blocks: OcrTextBlock[] | undefined): string[] {
  const words = toPositionedOcrWords(blocks);
  if (words.length < 2) {
    return [];
  }

  const typicalHeight = Math.max(1, median(words.map((word) => word.height)));
  const lines: SpatialOcrLine[] = [];
  [...words]
    .sort((a, b) => a.centerY - b.centerY || a.x - b.x)
    .forEach((word) => {
      const matchingLine = lines
        .map((line) => ({
          line,
          distance: Math.abs(line.centerY - word.centerY),
          overlapRatio: getVerticalOverlapRatio(line, word),
        }))
        .filter(({ distance, overlapRatio }) => overlapRatio >= 0.35 || distance <= typicalHeight * 0.5)
        .sort((a, b) => a.distance - b.distance)[0]?.line;

      if (matchingLine) {
        addWordToSpatialLine(matchingLine, word);
        return;
      }

      lines.push({
        words: [word],
        top: word.y,
        bottom: word.y + word.height,
        centerY: word.centerY,
      });
    });

  return lines
    .sort((a, b) => a.centerY - b.centerY)
    .map((line) => joinSpatialWords(line.words).trim())
    .filter(Boolean);
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

function extractAmountMatchesFromLine(line: string, minimumAmount = 10): AmountMatch[] {
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
        const amount = parseAmountValue(match[0]);
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

function extractLineItemAmountMatchesFromLine(line: string): AmountMatch[] {
  const normalizedLine = normalizeText(line);
  const unsignedMatches = extractAmountMatchesFromLine(normalizedLine, MIN_LINE_ITEM_AMOUNT);
  const discountMatches = isReceiptLineItemDiscount(normalizedLine) || /^\s*-/.test(normalizedLine)
    ? Array.from(normalizedLine.matchAll(/-\s*[\dOo〇○Cc¢][\dOo〇○Cc¢,\s.．()[\]（）]{0,14}(?:円)?/g))
        .map((match) => {
          const unsignedAmount = parseAmountValue(match[0]);
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
    (match) => Math.abs(match.amount) >= MIN_LINE_ITEM_AMOUNT,
  );
}

function extractAmountsFromLine(line: string, minimumAmount = 10): number[] {
  return extractAmountMatchesFromLine(line, minimumAmount)
    .map((match) => match.amount)
    .filter((amount) => amount >= minimumAmount)
    .filter((amount, index, amounts) => amounts.indexOf(amount) === index);
}

function getAmountConfidence(line: string): number {
  if (CHANGE_AMOUNT_KEYWORD_PATTERN.test(line)) {
    return 0.1;
  }

  if (CASH_TENDERED_KEYWORD_PATTERN.test(line)) {
    return 0.2;
  }

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

function getAmountContextLine(lines: string[], index: number): string {
  const line = lines[index] ?? "";
  const previousLine = lines[index - 1] ?? "";

  if (!previousLine || extractAmountsFromLine(previousLine).length > 0) {
    return line;
  }

  if (
    FINAL_AMOUNT_KEYWORD_PATTERN.test(previousLine) ||
    SUPPORTING_AMOUNT_KEYWORD_PATTERN.test(previousLine) ||
    CASH_TENDERED_KEYWORD_PATTERN.test(previousLine) ||
    CHANGE_AMOUNT_KEYWORD_PATTERN.test(previousLine) ||
    BALANCE_AMOUNT_KEYWORD_PATTERN.test(previousLine) ||
    LOYALTY_AMOUNT_KEYWORD_PATTERN.test(previousLine)
  ) {
    return `${previousLine} ${line}`;
  }

  return line;
}

function extractAmountCandidates(lines: string[]): Array<ReceiptCandidate<number>> {
  const keywordCandidates: Array<ReceiptCandidate<number>> = [];
  const fallbackCandidates: Array<ReceiptCandidate<number>> = [];
  const candidateLines = lines.slice(0, findAmountCandidateEndIndex(lines));

  candidateLines.forEach((line, index) => {
    const amounts = extractAmountsFromLine(line);
    if (amounts.length === 0) {
      return;
    }

    const contextLine = getAmountContextLine(lines, index);
    if (
      BALANCE_AMOUNT_KEYWORD_PATTERN.test(contextLine) ||
      LOYALTY_AMOUNT_KEYWORD_PATTERN.test(contextLine)
    ) {
      return;
    }

    const hasKeyword =
      FINAL_AMOUNT_KEYWORD_PATTERN.test(contextLine) ||
      SUPPORTING_AMOUNT_KEYWORD_PATTERN.test(contextLine) ||
      CASH_TENDERED_KEYWORD_PATTERN.test(contextLine);
    const hasMoneySymbol = /¥/.test(normalizeText(line));
    const confidence = hasKeyword ? getAmountConfidence(contextLine) : hasMoneySymbol ? 0.72 : 0.45;
    const target = hasKeyword || hasMoneySymbol ? keywordCandidates : fallbackCandidates;

    if (CHANGE_AMOUNT_KEYWORD_PATTERN.test(contextLine)) {
      return;
    }

    if (!hasKeyword && !hasMoneySymbol && shouldSkipFallbackAmountLine(line)) {
      return;
    }

    amounts.forEach((amount) => {
      target.push({
        value: amount,
        label: `¥${amount.toLocaleString("ja-JP")}`,
        line: contextLine.trim() || `行 ${index + 1}`,
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

function extractBalanceAmounts(lines: string[]): number[] {
  const amounts = lines.flatMap((line, index) => {
    const contextLine = getAmountContextLine(lines, index);
    return BALANCE_AMOUNT_KEYWORD_PATTERN.test(contextLine)
      ? extractAmountsFromLine(line)
      : [];
  });

  return amounts.filter((amount, index) => amounts.indexOf(amount) === index);
}

function extractTaxAmounts(lines: string[]): number[] {
  const detailedTaxAmounts: number[] = [];
  const aggregateTaxAmounts: number[] = [];

  lines.forEach((line, index) => {
    const normalizedLine = normalizeText(line);
    if (!isReceiptTaxAmountLine(normalizedLine) || isReceiptTaxBaseAmountLine(normalizedLine)) {
      return;
    }

    const lineWithoutTaxRates = normalizedLine.replace(/\d+(?:\.\d+)?\s*%/g, "");
    const currentLineAmounts = extractAmountsFromLine(lineWithoutTaxRates, 1);
    const amounts = currentLineAmounts.length > 0
      ? currentLineAmounts
      : extractAmountsFromLine(normalizeText(lines[index + 1] ?? ""), 1);
    const target = isReceiptTaxTotalLine(normalizedLine)
      ? aggregateTaxAmounts
      : detailedTaxAmounts;
    target.push(...amounts);
  });

  const amounts = detailedTaxAmounts.length > 0 ? detailedTaxAmounts : aggregateTaxAmounts;
  return amounts.filter((amount, index) => amounts.indexOf(amount) === index);
}

function removeAmountToken(line: string, match: AmountMatch): string {
  return `${line.slice(0, match.index)} ${line.slice(match.index + match.raw.length)}`;
}

function cleanLineItemName(line: string, match: AmountMatch): string {
  return normalizeReceiptLineItemName(removeAmountToken(normalizeText(line), match));
}

function isLineItemAmountOnlyLine(line: string, match: AmountMatch): boolean {
  if (/^\s*-/.test(normalizeText(line))) {
    return false;
  }

  const residualName = cleanLineItemName(line, match);
  return residualName.length === 0 || /^(?:特|特価)$/.test(residualName);
}

function isDiscountAmountOnlyLine(line: string, match: AmountMatch): boolean {
  return match.amount < 0 && cleanLineItemName(line, match).length === 0;
}

function shouldSkipSuppressedAmountLine(line: string, match: AmountMatch): boolean {
  const normalizedLine = normalizeText(line).trim();
  const residualName = cleanLineItemName(line, match);

  return normalizedLine.startsWith("¥") || residualName.length <= 3;
}

function getLineItemConfidence(line: string, match: AmountMatch): number {
  let confidence = match.hasMoneySymbol ? 0.78 : 0.6;

  if (/[*※]/.test(line)) {
    confidence += 0.08;
  }

  if (match.index > line.length * 0.45) {
    confidence += 0.08;
  }

  return Math.min(confidence, 0.94);
}

function findLineItemSubtotal(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeText(lines[index]);
    if (!/小\s*計/.test(line)) {
      continue;
    }

    const amounts = extractAmountsFromLine(line);
    const nextLine = normalizeText(lines[index + 1] ?? "");
    const nextAmounts =
      nextLine && !isReceiptTaxSummaryLine(nextLine) && !isReceiptAmountSectionLabel(nextLine)
        ? extractAmountsFromLine(nextLine)
        : [];
    const candidate = [...amounts, ...nextAmounts].sort((a, b) => b - a)[0];
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extractColumnOrderedLineItemAmounts(
  lines: string[],
): ReceiptLineItemReconciliationAmount[] {
  const subtotalIndex = lines.findIndex((line) => /小\s*計/.test(normalizeText(line)));
  if (subtotalIndex < 0) {
    return [];
  }

  const reconciliationEndIndex = lines.findIndex((line, index) => {
    if (index <= subtotalIndex) {
      return false;
    }

    return isLineItemReconciliationBoundary(getReceiptStructureBoundary(lines, index));
  });
  const reconciliationLines = lines.slice(
    subtotalIndex + 1,
    reconciliationEndIndex < 0 ? lines.length : reconciliationEndIndex,
  );

  return reconciliationLines
    .flatMap((line) => {
      const matches = extractLineItemAmountMatchesFromLine(line).filter((match) => (
        match.amount > 0 && isLineItemAmountOnlyLine(line, match)
      ));
      if (matches.length !== 1) {
        return [];
      }

      return [{
        amount: matches[0].amount,
        line: normalizeText(line).trim(),
        confidence: Math.max(0.68, getLineItemConfidence(line, matches[0]) - 0.1),
      }];
    })
    .slice(0, 20);
}

function findReceiptItemCount(lines: string[]): number | null {
  const compactText = normalizeText(lines.join(" ")).replace(/\s/g, "");
  const countMatch = compactText.match(/(?:点+数|お買上商品数|商品数)[:：]?(\d+)(?:個|点)?|(?:(\d+)点買)|小計(\d+)点/);
  const count = Number(countMatch?.[1] ?? countMatch?.[2] ?? countMatch?.[3]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function findSingleReceiptProductName(
  lines: string[],
  profile: ReceiptLineItemProfile,
): { name: string; line: string } | null {
  const receiptMarkerIndex = lines.findIndex((line) => isReceiptMarkerLine(line));
  if (receiptMarkerIndex < 0) {
    return null;
  }

  let summaryIndex = -1;
  for (let index = receiptMarkerIndex + 1; index < lines.length; index += 1) {
    if (getReceiptStructureBoundary(lines, index) !== null) {
      summaryIndex = index;
      break;
    }
  }

  if (summaryIndex <= receiptMarkerIndex + 1) {
    return null;
  }

  const productLines = lines
    .slice(receiptMarkerIndex + 1, summaryIndex)
    .filter((line) => !shouldSkipReceiptLineItemLine(line))
    .filter((line) => extractLineItemAmountMatchesFromLine(line).length === 0)
    .filter((line) => isPotentialReceiptLineItemNameLine(line, profile))
    .map((line) => normalizeReceiptLineItemName(line));

  if (productLines.length === 0 || productLines.length > 2) {
    return null;
  }

  const name = normalizeReceiptLineItemName(productLines.join(" "));
  if (!isUsableReceiptLineItemName(name)) {
    return null;
  }

  return {
    name,
    line: productLines.join(" / "),
  };
}

function inferSingleReceiptLineItem(
  candidates: ReceiptLineItemCandidate[],
  lines: string[],
  profile: ReceiptLineItemProfile,
  totalAmount: number | undefined,
): ReceiptLineItemCandidate[] {
  if (candidates.length > 0 || findReceiptItemCount(lines) !== 1) {
    return candidates;
  }

  const product = findSingleReceiptProductName(lines, profile);
  if (!product || !totalAmount) {
    return candidates;
  }

  return [
    {
      name: product.name,
      amount: totalAmount,
      line: `${product.line} / 1点・合計から補完`,
      confidence: 0.58,
      extractionMethod: "single_item_total",
    },
  ];
}

function extractLineItemCandidates(
  lines: string[],
  totalAmount: number | undefined,
): ReceiptLineItemCandidate[] {
  const profile = detectReceiptLineItemProfile(lines);
  const association = new ReceiptLineItemAssociator(profile.maxPendingNames);
  let pendingDiscountName: PendingReceiptLineItemName | null = null;
  let suppressNextAmountOnlyLine = false;
  let reachedSummaryBoundary = false;
  let lineItemSectionStarted = !profile.requiresItemCodeToStart;

  lines.forEach((line, index) => {
    const normalizedLine = normalizeText(line);
    if (reachedSummaryBoundary) {
      return;
    }

    if (!lineItemSectionStarted) {
      if (!hasReceiptLineItemCode(normalizedLine, profile)) {
        const nextLine = normalizeText(lines[index + 1] ?? "");
        const amountMatches = extractLineItemAmountMatchesFromLine(line);
        const amountMatch = amountMatches.length === 1 ? amountMatches[0] : null;
        if (
          amountMatch?.hasMoneySymbol &&
          amountMatch.amount > 0 &&
          isLineItemAmountOnlyLine(line, amountMatch) &&
          hasReceiptLineItemCode(nextLine, profile)
        ) {
          association.queueAmount({
            amount: amountMatch.amount,
            line: normalizedLine.trim(),
            confidence: Math.max(0.72, getLineItemConfidence(line, amountMatch) - 0.04),
          });
        }
        return;
      }
      lineItemSectionStarted = true;
    }

    const structureBoundary = getReceiptStructureBoundary(lines, index);
    const hasLineItemEvidence = association.hasEvidence() || pendingDiscountName !== null;
    if (structureBoundary !== null && (structureBoundary !== "footer" || hasLineItemEvidence)) {
      association.resetPending();
      pendingDiscountName = null;
      suppressNextAmountOnlyLine = false;
      reachedSummaryBoundary = true;
      return;
    }

    if (shouldSkipReceiptLineItemLine(line)) {
      association.resetPending();
      pendingDiscountName = null;
      suppressNextAmountOnlyLine = isReceiptAmountSectionLabel(line);
      return;
    }

    if (isReceiptLineItemDiscountMarker(normalizedLine)) {
      pendingDiscountName = createPendingReceiptDiscountName(line);
      suppressNextAmountOnlyLine = false;
      return;
    }

    let matches = extractLineItemAmountMatchesFromLine(line).filter(
      (match) => Math.abs(match.amount) >= MIN_LINE_ITEM_AMOUNT && Math.abs(match.amount) <= 1_000_000,
    );
    if (
      isReceiptLineItemDiscount(line) &&
      !/^\s*-/.test(normalizeText(line)) &&
      !/[-]\s*\d/.test(normalizeText(line)) &&
      matches.every((match) => match.amount <= 100)
    ) {
      matches = [];
    }
    if (matches.length === 0) {
      suppressNextAmountOnlyLine = false;
      const pendingName = isPotentialReceiptLineItemNameLine(line, profile)
        ? createPendingReceiptLineItemName(line, profile)
        : null;
      if (pendingName) {
        association.addName(pendingName);
      } else {
        association.resetPending();
      }
      return;
    }

    const match = matches.find((candidate) => candidate.amount < 0) ?? matches[matches.length - 1];
    if (suppressNextAmountOnlyLine && shouldSkipSuppressedAmountLine(line, match)) {
      suppressNextAmountOnlyLine = false;
      association.resetPending();
      return;
    }
    suppressNextAmountOnlyLine = false;

    if (isDiscountAmountOnlyLine(line, match)) {
      const discountName = pendingDiscountName ?? createPendingReceiptDiscountName("割引");
      association.addCandidate({
        name: discountName.name,
        amount: match.amount,
        line: `${discountName.line} / ${normalizeText(line).trim()}`,
        confidence: Math.max(0.72, getLineItemConfidence(line, match) - 0.04),
        extractionMethod: "discount_pair",
      });
      pendingDiscountName = null;
      return;
    }

    const pendingAmount = {
      amount: match.amount,
      line: normalizeText(line).trim(),
      confidence: Math.max(0.72, getLineItemConfidence(line, match) - 0.04),
    };
    if (association.hasPendingNames() && isLineItemAmountOnlyLine(line, match)) {
      association.pairPendingNameWithAmount(pendingAmount);
      return;
    }

    if (!association.hasPendingNames() && isLineItemAmountOnlyLine(line, match) && match.amount > 0) {
      association.queueAmount(pendingAmount);
      return;
    }

    association.resetPending();
    pendingDiscountName = null;
    const name = cleanLineItemName(line, match);
    if (!isUsableReceiptLineItemName(name)) {
      return;
    }

    association.addCandidate({
      name,
      amount: match.amount,
      line: normalizeText(line).trim(),
      confidence: getLineItemConfidence(line, match),
      extractionMethod: "same_line",
    });
  });

  const candidates = association.getCandidates();
  const unmatchedNames = association.getUnmatchedNames();
  const reconciledCandidates = reconcileReceiptLineItems({
    candidates,
    unmatchedNames,
    profile,
    evidence: {
      declaredItemCount: findReceiptItemCount(lines),
      subtotal: findLineItemSubtotal(lines),
      columnOrderedAmounts: extractColumnOrderedLineItemAmounts(lines),
    },
  });
  return inferSingleReceiptLineItem(reconciledCandidates, lines, profile, totalAmount)
    .slice(0, MAX_LINE_ITEM_CANDIDATES);
}

export function parseReceiptText(text: string, blocks?: OcrTextBlock[]): ReceiptParseResult {
  const lines = normalizeText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const spatialLines = reconstructSpatialTextLines(blocks);
  const textAmountCandidates = extractAmountCandidates(lines);
  const spatialAmountCandidates = spatialLines.length > 0 ? extractAmountCandidates(spatialLines) : [];
  const textPrimaryAmount = textAmountCandidates[0];
  const spatialPrimaryAmount = spatialAmountCandidates[0];
  const amountCandidates = spatialPrimaryAmount?.confidence >= 0.9
    ? textPrimaryAmount?.confidence >= 0.9 && textPrimaryAmount.value !== spatialPrimaryAmount.value
      ? uniqueCandidates([...spatialAmountCandidates, ...textAmountCandidates]).slice(0, 6)
      : spatialAmountCandidates
    : textAmountCandidates;
  const textLineItemCandidates = extractLineItemCandidates(lines, textPrimaryAmount?.value);
  const spatialLineItemCandidates = spatialLines.length > 0
    ? extractLineItemCandidates(spatialLines, spatialPrimaryAmount?.value)
    : [];
  const spatialTaxAmounts = spatialLines.length > 0 ? extractTaxAmounts(spatialLines) : [];
  const balanceAmounts = [
    ...extractBalanceAmounts(lines),
    ...extractBalanceAmounts(spatialLines),
  ].filter((amount, index, amounts) => amounts.indexOf(amount) === index);

  return {
    dateCandidates: extractDateCandidates(lines),
    shopNameCandidates: extractShopNameCandidates(
      lines,
      (line) => extractAmountsFromLine(line).length > 0,
    ),
    amountCandidates,
    lineItemCandidates: selectReceiptLineItemCandidates({
      spatialCandidates: spatialLineItemCandidates,
      textCandidates: textLineItemCandidates,
      declaredItemCount: findReceiptItemCount(spatialLines) ?? findReceiptItemCount(lines),
      subtotal: findLineItemSubtotal(spatialLines) ?? findLineItemSubtotal(lines),
    }),
    riskSignals: {
      balanceAmounts,
      taxAmounts: spatialTaxAmounts.length > 0 ? spatialTaxAmounts : extractTaxAmounts(lines),
    },
  };
}

export function scoreReceiptParseResult(result: ReceiptParseResult): number {
  const dateScore = result.dateCandidates[0]?.confidence ?? 0;
  const shopScore = result.shopNameCandidates[0]?.confidence ?? 0;
  const amountScore = result.amountCandidates[0]?.confidence ?? 0;
  const amountDiversityScore = Math.min(result.amountCandidates.length, 3) * 0.04;

  return dateScore * 0.32 + shopScore * 0.24 + amountScore * 0.4 + amountDiversityScore;
}
