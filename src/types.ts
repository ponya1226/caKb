export type ExpenseSource = "manual" | "receipt";

export type OcrProvider = "localTesseract" | "googleVision";

export type OcrTextBlock = {
  text: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type OcrResult = {
  provider: OcrProvider;
  text: string;
  confidence?: number;
  blocks?: OcrTextBlock[];
};

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
  shopCategoryRules?: ShopCategoryRule[];
};

export type ShopCategoryRule = {
  id: string;
  shopName: string;
  normalizedShopName: string;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
};

export type StorageHealth = {
  indexedDbAvailable: boolean;
  persistentStorageSupported: boolean;
  persistentStorageGranted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
  expenseCount: number;
  monthCount: number;
  oldestMonth?: string;
  latestMonth?: string;
  checkedAt: string;
};

export type BackupData = {
  app: "caKb";
  version: 1;
  exportedAt: string;
  expenses: Expense[];
  categories: Category[];
  settings: AppSettings;
};

export type BackupImportMode = "append" | "replace";

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
  source?: "rule" | "history";
  ruleId?: string;
};

export type ExpenseFormValues = {
  date: string;
  shopName: string;
  amount: number;
  categoryId: string;
  memo: string;
};

export type ReceiptSaveOptions = {
  saveCategoryRule: boolean;
};

export type ReceiptDraft = {
  imageFile: File;
  imagePreviewUrl: string;
  ocrImagePreviewUrl?: string;
  ocrProvider?: OcrProvider;
  ocrBlocks?: OcrTextBlock[];
  ocrText: string;
  parseResult: ReceiptParseResult;
  initialValues: ExpenseFormValues;
  ocrCrop?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  ocrPresetLabel?: string;
  ocrPreprocess?: boolean;
  ocrPreprocessMode?: string;
  categorySuggestion?: ReceiptCategorySuggestion;
};
