import { normalizeReceiptText } from "./receiptText";

const RECEIPT_SUBTOTAL_BOUNDARY_PATTERN = /^\s*小\s*計(?:\s|¥|$)/i;
const RECEIPT_PAYABLE_TOTAL_BOUNDARY_PATTERN =
  /^\s*(?:合\s*計|総\s*合\s*計|総\s*計|総\s*額|現\s*計|税\s*込\s*金\s*額\s*合\s*計|お\s*買\s*(?:い\s*)?上\s*(?:げ\s*)?計|お\s*会\s*計|ご?\s*請\s*求\s*額|お?\s*支\s*払(?:い)?\s*額|決\s*済\s*額)(?:\s|[:：¥]|$)/i;
const RECEIPT_PAYMENT_BOUNDARY_PATTERN =
  /^\s*(?:支\s*払(?:\s*額)?|お\s*支\s*払(?:\s*額)?|交通\s*系\s*マネー|電子\s*マネー|電子\s*決済|クレジット(?:\s*カード)?|カード\s*支払|Pay\s*Pay|QUIC\s*Pay|Suica|PASMO)(?:\s|[:：¥]|$)/i;
const RECEIPT_TENDERED_BOUNDARY_PATTERN =
  /^\s*(?:現\s*金|お\s*預(?:かり|り)?(?:\s*計)?|預\s*り(?:\s*計)?)(?:\s|[:：¥]|$)/i;
const RECEIPT_POST_PAYMENT_BOUNDARY_PATTERN =
  /^\s*(?:お\s*釣(?:り)?|おつり|釣\s*り|釣銭|支\s*払\s*後\s*残\s*高|残\s*高|利用\s*可能\s*額)(?:\s|[:：¥]|は|$)/i;
const RECEIPT_FOOTER_BOUNDARY_PATTERN =
  /^\s*(?:会員\s*(?:番号|ランク)|ポイント\s*(?:対象|明細|残高)|今回\s*獲得|累計\s*ポイント|次\s*ランク|ランク\s*保証|カード\s*No\.?|クーポン|登録番号|株式会社|上記\s*正に\s*領収|収いたしました)/i;
const RECEIPT_TAX_SUMMARY_PATTERN =
  /\d+\s*%\s*(?:内|外)?税(?:額)?(?:\s|$)|\d+\s*%\s*(?:内|外)?税\s*対象|税込金額|税抜対象額/i;
const RECEIPT_TAX_AMOUNT_PATTERN =
  /(消\s*費\s*税(?:等|額)?|内\s*消\s*費\s*税(?:等|額)?|外\s*税(?:額)?|\d+\s*%\s*(?:内|外)?税(?:額)?(?!抜|込|対象))/i;
const RECEIPT_TAX_TOTAL_PATTERN =
  /((?:内|外)\s*税(?:額)?\s*計|消\s*費\s*税(?:等|額)?\s*計|税\s*額\s*計)/i;
const RECEIPT_TAX_BASE_AMOUNT_PATTERN = /(対\s*象\s*額|税\s*込\s*金\s*額|税\s*抜\s*金\s*額)/i;

export type ReceiptStructureBoundary =
  | "subtotal"
  | "tax"
  | "payableTotal"
  | "payment"
  | "tendered"
  | "postPayment"
  | "footer";

function normalizeLine(value: string): string {
  return normalizeReceiptText(value).trim();
}

function isSplitPayableTotal(lines: readonly string[], index: number): boolean {
  const previous = normalizeLine(lines[index - 1] ?? "").replace(/\s/g, "");
  const current = normalizeLine(lines[index] ?? "").replace(/\s/g, "");
  const next = normalizeLine(lines[index + 1] ?? "").replace(/\s/g, "");
  const splitTotalPattern = /^(?:合計|総合計|総計|現計|お買上計)(?:¥?\d[\d,.]*)?$/;
  return splitTotalPattern.test(`${current}${next}`) || splitTotalPattern.test(`${previous}${current}`);
}

export function isReceiptTaxSummaryLine(value: string): boolean {
  return RECEIPT_TAX_SUMMARY_PATTERN.test(normalizeLine(value));
}

export function isReceiptTaxAmountLine(value: string): boolean {
  return RECEIPT_TAX_AMOUNT_PATTERN.test(normalizeLine(value));
}

export function isReceiptTaxTotalLine(value: string): boolean {
  return RECEIPT_TAX_TOTAL_PATTERN.test(normalizeLine(value));
}

export function isReceiptTaxBaseAmountLine(value: string): boolean {
  return RECEIPT_TAX_BASE_AMOUNT_PATTERN.test(normalizeLine(value));
}

export function getReceiptStructureBoundary(
  lines: readonly string[],
  index: number,
): ReceiptStructureBoundary | null {
  const line = normalizeLine(lines[index] ?? "");

  if (isSplitPayableTotal(lines, index) || RECEIPT_PAYABLE_TOTAL_BOUNDARY_PATTERN.test(line)) {
    return "payableTotal";
  }

  if (RECEIPT_SUBTOTAL_BOUNDARY_PATTERN.test(line)) {
    return "subtotal";
  }

  if (
    isReceiptTaxSummaryLine(line) ||
    isReceiptTaxAmountLine(line) ||
    isReceiptTaxTotalLine(line) ||
    isReceiptTaxBaseAmountLine(line)
  ) {
    return "tax";
  }

  if (RECEIPT_POST_PAYMENT_BOUNDARY_PATTERN.test(line)) {
    return "postPayment";
  }

  if (RECEIPT_TENDERED_BOUNDARY_PATTERN.test(line)) {
    return "tendered";
  }

  if (RECEIPT_PAYMENT_BOUNDARY_PATTERN.test(line)) {
    return "payment";
  }

  return RECEIPT_FOOTER_BOUNDARY_PATTERN.test(line) ? "footer" : null;
}

export function findAmountCandidateEndIndex(lines: readonly string[]): number {
  let transactionSummarySeen = false;
  let payableTotalSeen = false;

  for (let index = 0; index < lines.length; index += 1) {
    const boundary = getReceiptStructureBoundary(lines, index);
    if (boundary === "payableTotal") {
      transactionSummarySeen = true;
      payableTotalSeen = true;
      continue;
    }

    if (boundary === "tendered") {
      if (payableTotalSeen) {
        return index;
      }

      transactionSummarySeen = true;
      continue;
    }

    if (boundary === "payment") {
      transactionSummarySeen = true;
      continue;
    }

    if (boundary === "subtotal" || boundary === "tax") {
      transactionSummarySeen = true;
      continue;
    }

    if (boundary === "postPayment" || (boundary === "footer" && transactionSummarySeen)) {
      return index;
    }
  }

  return lines.length;
}

export function isLineItemReconciliationBoundary(boundary: ReceiptStructureBoundary | null): boolean {
  return (
    boundary === "payableTotal" ||
    boundary === "payment" ||
    boundary === "tendered" ||
    boundary === "postPayment" ||
    boundary === "footer"
  );
}
