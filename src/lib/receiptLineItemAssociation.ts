import type { ReceiptLineItemCandidate } from "../types";

export type PendingReceiptLineItemName = {
  name: string;
  line: string;
  hasItemCode: boolean;
  isDiscount: boolean;
};

export type PendingReceiptLineItemAmount = {
  amount: number;
  line: string;
  confidence: number;
};

export class ReceiptLineItemAssociator {
  private readonly candidates: ReceiptLineItemCandidate[] = [];
  private readonly pendingNames: PendingReceiptLineItemName[] = [];
  private readonly pendingAmounts: PendingReceiptLineItemAmount[] = [];
  private readonly unmatchedNames: PendingReceiptLineItemName[] = [];

  constructor(private readonly maxPendingNames: number) {}

  hasEvidence(): boolean {
    return this.candidates.length > 0 || this.pendingNames.length > 0 || this.unmatchedNames.length > 0;
  }

  hasPendingNames(): boolean {
    return this.pendingNames.length > 0;
  }

  addCandidate(candidate: ReceiptLineItemCandidate): void {
    this.candidates.push(candidate);
  }

  addName(name: PendingReceiptLineItemName): boolean {
    const hasMultiplePendingAmounts = this.pendingAmounts.length > 1;
    const pendingAmount = this.pendingAmounts.shift();
    if (pendingAmount && name.hasItemCode) {
      this.candidates.push({
        name: name.name,
        amount: pendingAmount.amount,
        line: `${pendingAmount.line} / ${name.line}`,
        confidence: pendingAmount.confidence,
        extractionMethod: hasMultiplePendingAmounts ? "ambiguous_pair" : "amount_before_name",
      });
      return true;
    }

    if (name.hasItemCode && this.pendingNames.some((item) => !item.hasItemCode)) {
      this.flushPendingNamesAsUnmatched();
    }

    this.pendingNames.push(name);
    if (this.pendingNames.length > this.maxPendingNames) {
      this.recordUnmatchedName(this.pendingNames.shift());
    }
    return false;
  }

  pairPendingNameWithAmount(amount: PendingReceiptLineItemAmount): boolean {
    const hasMultiplePendingNames = this.pendingNames.length > 1;
    const pendingName = this.pendingNames.shift();
    if (!pendingName) {
      return false;
    }

    this.candidates.push({
      name: pendingName.name,
      amount: amount.amount,
      line: `${pendingName.line} / ${amount.line}`,
      confidence: amount.confidence,
      extractionMethod: hasMultiplePendingNames ? "ambiguous_pair" : "name_before_amount",
    });
    return true;
  }

  queueAmount(amount: PendingReceiptLineItemAmount): void {
    this.pendingAmounts.push(amount);
    if (this.pendingAmounts.length > 3) {
      this.pendingAmounts.shift();
    }
  }

  clearPendingAmounts(): void {
    this.pendingAmounts.length = 0;
  }

  flushPendingNamesAsUnmatched(): void {
    this.pendingNames.forEach((name) => this.recordUnmatchedName(name));
    this.pendingNames.length = 0;
  }

  resetPending(): void {
    this.flushPendingNamesAsUnmatched();
    this.clearPendingAmounts();
  }

  getCandidates(): ReceiptLineItemCandidate[] {
    return [...this.candidates];
  }

  getUnmatchedNames(): PendingReceiptLineItemName[] {
    return [...this.unmatchedNames];
  }

  private recordUnmatchedName(name: PendingReceiptLineItemName | undefined): void {
    if (name?.hasItemCode && !name.isDiscount) {
      this.unmatchedNames.push(name);
    }
  }
}
