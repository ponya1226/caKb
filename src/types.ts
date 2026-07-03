export type ExpenseSource = "manual" | "receipt";

export type Expense = {
  id: string;
  date: string;
  shopName: string;
  amount: number;
  categoryId: string;
  memo: string;
  source: ExpenseSource;
  receiptImageId?: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type ReceiptImage = {
  id: string;
  imageBlob: Blob;
  ocrText: string;
  createdAt: string;
};

export type AppSettings = {
  saveReceiptImages: boolean;
  lastOcrCrop?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
};

export type OcrProgress = {
  status: string;
  progress: number;
};

export type ReceiptCandidate<T> = {
  value: T;
  label: string;
  line: string;
  confidence: number;
};

export type ReceiptParseResult = {
  dateCandidates: Array<ReceiptCandidate<string>>;
  shopNameCandidates: Array<ReceiptCandidate<string>>;
  amountCandidates: Array<ReceiptCandidate<number>>;
};

export type ReceiptCategorySuggestion = {
  categoryId: string;
  matchedShopName: string;
};

export type ExpenseFormValues = {
  date: string;
  shopName: string;
  amount: number;
  categoryId: string;
  memo: string;
};

export type ReceiptDraft = {
  imageFile: File;
  imagePreviewUrl: string;
  ocrText: string;
  parseResult: ReceiptParseResult;
  initialValues: ExpenseFormValues;
  categorySuggestion?: ReceiptCategorySuggestion;
};
