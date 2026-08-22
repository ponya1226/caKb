import type { PendingReceiptLineItemName } from "./receiptLineItemAssociation";
import {
  hasReceiptLineItemCode,
  type ReceiptLineItemProfile,
} from "./receiptLineItemProfiles";
import { isReceiptTaxSummaryLine } from "./receiptStructure";
import { normalizeReceiptText } from "./receiptText";

const LINE_ITEM_EXCLUDE_PATTERN =
  /(合\s*計|現\s*計|小\s*計|税\s*込|消\s*費\s*税|外\s*税|内\s*税|税率|対象|支\s*払|現\s*金|お\s*預|預\s*り|お\s*釣|おつり|釣\s*り|釣銭|残\s*高|利用\s*可能\s*額|領収|明細|登録番号|TEL|電話|レジ|伝票|No\.?|WAON|POINT|ポイント|会員\s*ランク|ランク\s*保証|次\s*ランク|今回\s*獲得|クーポン|http|https|お買上|マーク|軽減税率|株式会社|収いたしました|満足宣言)/i;
const LINE_ITEM_PAYMENT_PATTERN =
  /(交通\s*系\s*マネー|電子\s*マネー|電子\s*決済|クレジット|カード|QUIC\s*Pay|Suica|PASMO)/i;
const LINE_ITEM_STAFF_PATTERN = /(?:担当|責|貴|係員|スタッフ)\s*[:：]/i;
const LINE_ITEM_NAME_EXCLUDE_PATTERN = /^[\s\-_=*※¥\d,.()（）[\]【】「」'"#]+$/;
const LINE_ITEM_DISCOUNT_PATTERN = /(割\s*引|値\s*引)/i;
const AMOUNT_SECTION_LABEL_PATTERN =
  /(合\s*計|現\s*計|小\s*計|税\s*込|消\s*費\s*税|外\s*税|内\s*税|税率|対象|支\s*払|現\s*金|お\s*預|預\s*り|お\s*釣|おつり|釣\s*り|釣銭|残\s*高|利用\s*可能\s*額|お\s*買\s*上\s*計|交通\s*系\s*マネー|電子\s*マネー|クレジット|カード)/i;
const RECEIPT_MARKER_PATTERN = /(領\s*収\s*[証書]|レシート)/i;

export function normalizeReceiptLineItemName(value: string): string {
  return normalizeReceiptText(value)
    .replace(/[¥￥]/g, "")
    .replace(/[*※★]/g, "")
    .replace(/[|｜{}]/g, " ")
    .replace(/^\s*(?:外|内)\s*(?:8|10)\s+#?\d{1,4}\s+/, "")
    .replace(/^\s*\d{1,2}\s+/, "")
    .replace(/^[\s\-_=・:：,.、。[\]【】「」'"#]+/, "")
    .replace(/^\s*\d{1,4}\s+/, "")
    .replace(/[\s\-_=・:：,.、。[\]【】「」'"#]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isReceiptCodeLikeLine(line: string): boolean {
  const compactLine = normalizeReceiptText(line).replace(/\s/g, "");
  return (
    /\d{12,}/.test(compactLine) ||
    /\d{2,4}-\d{2,4}-\d{2,4}/.test(compactLine) ||
    /(?:[*＊Xx]{2,}[-ー]?){1,}\d{3,4}$/.test(compactLine)
  );
}

function isPhoneNumberLikeLine(line: string): boolean {
  const compactLine = normalizeReceiptText(line).replace(/\s/g, "");
  return /(?:^|[^\d])0\d{1,3}(?:[-ー－]|[（(])\d{2,4}(?:[-ー－]|[）)])\d{3,4}(?:[^\d]|$)/.test(
    compactLine,
  );
}

function isAddressLikeLineItemLine(line: string): boolean {
  const normalizedLine = normalizeReceiptText(line);
  return (
    /(都|道|府|県).*(市|区|郡|町|村)/.test(normalizedLine) ||
    /(?:市|区|郡|町|村|丁目|番地).*(?:\d+\s*[-ー－]\s*\d+|\d+\s+\d+)/.test(normalizedLine)
  );
}

export function shouldSkipReceiptLineItemLine(line: string): boolean {
  const normalizedLine = normalizeReceiptText(line);
  if (isReceiptTaxSummaryLine(normalizedLine)) {
    return true;
  }

  if (/\(?\d+\s*×\s*\d+\s*(?:個|点|本|枚|袋|パック|連)/.test(normalizedLine)) {
    return true;
  }

  if (LINE_ITEM_EXCLUDE_PATTERN.test(normalizedLine)) {
    return true;
  }

  if (
    LINE_ITEM_PAYMENT_PATTERN.test(normalizedLine) ||
    LINE_ITEM_STAFF_PATTERN.test(normalizedLine) ||
    isPhoneNumberLikeLine(normalizedLine) ||
    isAddressLikeLineItemLine(normalizedLine) ||
    isReceiptCodeLikeLine(normalizedLine)
  ) {
    return true;
  }

  return (
    /\d{1,4}\s*(?:年|\/|-|\.)\s*\d{1,2}/.test(normalizedLine) ||
    /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(normalizedLine) ||
    /^\d{1,2}:\d{2}(?::\d{2})?$/.test(normalizedLine)
  );
}

export function isUsableReceiptLineItemName(name: string): boolean {
  if (name.length < 2 || name.length > 48) {
    return false;
  }

  if (LINE_ITEM_NAME_EXCLUDE_PATTERN.test(name)) {
    return false;
  }

  const digitCount = name.match(/\d/g)?.length ?? 0;
  return digitCount / name.length < 0.55;
}

export function isPotentialReceiptLineItemNameLine(
  line: string,
  profile: ReceiptLineItemProfile,
): boolean {
  const normalizedLine = normalizeReceiptText(line);
  const name = normalizeReceiptLineItemName(normalizedLine);
  if (hasReceiptLineItemCode(normalizedLine, profile)) {
    return isUsableReceiptLineItemName(name);
  }

  if (!/[一-龯ぁ-んァ-ヶA-Za-z]/.test(name)) {
    return false;
  }

  return isUsableReceiptLineItemName(name);
}

export function isReceiptLineItemDiscount(value: string): boolean {
  return LINE_ITEM_DISCOUNT_PATTERN.test(normalizeReceiptText(value));
}

export function createPendingReceiptLineItemName(
  line: string,
  profile: ReceiptLineItemProfile,
): PendingReceiptLineItemName | null {
  const normalizedLine = normalizeReceiptText(line);
  const name = normalizeReceiptLineItemName(line);
  if (!isUsableReceiptLineItemName(name)) {
    return null;
  }

  return {
    name,
    line: normalizedLine.trim(),
    hasItemCode: hasReceiptLineItemCode(normalizedLine, profile),
    isDiscount: isReceiptLineItemDiscount(name),
  };
}

export function isReceiptLineItemDiscountMarker(line: string): boolean {
  const normalizedLine = normalizeReceiptText(line);
  if (!/%/.test(normalizedLine) || /-\s*\d/.test(normalizedLine)) {
    return false;
  }

  return (
    isReceiptLineItemDiscount(normalizedLine) ||
    (/[★*※]/.test(normalizedLine) && /\(?\s*\d{1,2}\s*%\s*\)?/.test(normalizedLine))
  );
}

export function createPendingReceiptDiscountName(line: string): PendingReceiptLineItemName {
  const normalizedLine = normalizeReceiptText(line).trim();
  const normalizedName = normalizeReceiptLineItemName(normalizedLine);
  const rate = normalizedLine.match(/(\d{1,2})\s*%/)?.[1];
  const name = isReceiptLineItemDiscount(normalizedName)
    ? normalizedName
    : `割引${rate ? `(${rate}%)` : ""}`;

  return {
    name,
    line: normalizedLine,
    hasItemCode: false,
    isDiscount: true,
  };
}

export function isReceiptAmountSectionLabel(line: string): boolean {
  return AMOUNT_SECTION_LABEL_PATTERN.test(normalizeReceiptText(line));
}

export function isReceiptMarkerLine(line: string): boolean {
  return RECEIPT_MARKER_PATTERN.test(normalizeReceiptText(line));
}
