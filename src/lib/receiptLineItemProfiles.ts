import { normalizeReceiptText } from "./receiptText";

export type ReceiptLineItemProfileId = "generic" | "department-coded-grocery";

export type ReceiptLineItemProfile = {
  id: ReceiptLineItemProfileId;
  itemCodePattern: RegExp;
  requiresItemCodeToStart: boolean;
  maxPendingNames: number;
  columnReconciliationMinItems: number;
  columnReconciliationMaxItems: number;
};

const GENERIC_PROFILE: ReceiptLineItemProfile = {
  id: "generic",
  itemCodePattern: /^\s*#?\d{1,4}\s+\S/,
  requiresItemCodeToStart: false,
  maxPendingNames: 4,
  columnReconciliationMinItems: 2,
  columnReconciliationMaxItems: 10,
};

const DEPARTMENT_CODED_GROCERY_PROFILE: ReceiptLineItemProfile = {
  id: "department-coded-grocery",
  itemCodePattern: /^\s*(?:\d{2}|(?:外|内)\s*(?:8|10)\s+#?\d{2,4}[*※★]?)\s+\S/,
  requiresItemCodeToStart: true,
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
  const declaredItemCount = Number(
    compactText.match(/(?:小計|(?:お)?買上点数)(\d+)点/)?.[1],
  );

  // Requiring both signals avoids selecting a store profile from a brand name or an isolated item code.
  if (departmentCodedLineCount < 3 || !Number.isInteger(declaredItemCount) || declaredItemCount <= 0) {
    return GENERIC_PROFILE;
  }

  const profileItemLimit = Math.min(30, Math.max(4, declaredItemCount));
  return {
    ...DEPARTMENT_CODED_GROCERY_PROFILE,
    maxPendingNames: profileItemLimit,
    columnReconciliationMaxItems: profileItemLimit,
  };
}

export function hasReceiptLineItemCode(line: string, profile: ReceiptLineItemProfile): boolean {
  return profile.itemCodePattern.test(normalizeReceiptText(line));
}
