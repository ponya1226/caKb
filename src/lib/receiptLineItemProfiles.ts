import { normalizeReceiptText } from "./receiptText";

export type ReceiptLineItemProfileId = "generic" | "department-coded-grocery";

export type ReceiptLineItemProfile = {
  id: ReceiptLineItemProfileId;
  itemCodePattern: RegExp;
  maxPendingNames: number;
  columnReconciliationMinItems: number;
  columnReconciliationMaxItems: number;
};

const GENERIC_PROFILE: ReceiptLineItemProfile = {
  id: "generic",
  itemCodePattern: /^\s*#?\d{1,4}\s+\S/,
  maxPendingNames: 4,
  columnReconciliationMinItems: 2,
  columnReconciliationMaxItems: 10,
};

const DEPARTMENT_CODED_GROCERY_PROFILE: ReceiptLineItemProfile = {
  id: "department-coded-grocery",
  itemCodePattern: /^\s*\d{2}\s+\S/,
  maxPendingNames: 12,
  columnReconciliationMinItems: 2,
  columnReconciliationMaxItems: 12,
};

export function detectReceiptLineItemProfile(lines: readonly string[]): ReceiptLineItemProfile {
  const normalizedLines = lines.map(normalizeReceiptText);
  const departmentCodedLineCount = normalizedLines.filter((line) => (
    DEPARTMENT_CODED_GROCERY_PROFILE.itemCodePattern.test(line)
  )).length;
  const compactText = normalizedLines.join(" ").replace(/\s/g, "");
  const declaredSubtotalCount = Number(compactText.match(/小計(\d+)点/)?.[1]);

  // Requiring both signals avoids selecting a store profile from a brand name or an isolated item code.
  if (departmentCodedLineCount < 3 || !Number.isInteger(declaredSubtotalCount) || declaredSubtotalCount <= 0) {
    return GENERIC_PROFILE;
  }

  const profileItemLimit = Math.min(30, Math.max(4, declaredSubtotalCount));
  return {
    ...DEPARTMENT_CODED_GROCERY_PROFILE,
    maxPendingNames: profileItemLimit,
    columnReconciliationMaxItems: profileItemLimit,
  };
}

export function hasReceiptLineItemCode(line: string, profile: ReceiptLineItemProfile): boolean {
  return profile.itemCodePattern.test(normalizeReceiptText(line));
}
