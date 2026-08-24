import {
  extractAmountsFromLine,
  extractLineItemAmountMatchesFromLine,
  getLineItemConfidence,
  isLineItemAmountOnlyLine,
} from "./receiptAmounts";
import { isReceiptAmountSectionLabel } from "./receiptLineItemClassification";
import type {
  ReceiptLineItemReconciliationAmount,
  ReceiptLineItemReconciliationEvidence,
} from "./receiptLineItemReconciliation";
import {
  getReceiptStructureBoundary,
  isLineItemReconciliationBoundary,
  isReceiptTaxSummaryLine,
} from "./receiptStructure";
import { normalizeReceiptText as normalizeText } from "./receiptText";

export function findLineItemSubtotal(lines: string[]): number | null {
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

export function findReceiptItemCount(lines: string[]): number | null {
  const compactText = normalizeText(lines.join(" ")).replace(/\s/g, "");
  const countMatch = compactText.match(/(?:点+数|お買上商品数|商品数)[:：]?(\d+)(?:個|点)?|(?:(\d+)点買)|小計(\d+)点/);
  const count = Number(countMatch?.[1] ?? countMatch?.[2] ?? countMatch?.[3]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function createReceiptLineItemReconciliationEvidence(
  lines: string[],
): ReceiptLineItemReconciliationEvidence {
  return {
    declaredItemCount: findReceiptItemCount(lines),
    subtotal: findLineItemSubtotal(lines),
    columnOrderedAmounts: extractColumnOrderedLineItemAmounts(lines),
  };
}
