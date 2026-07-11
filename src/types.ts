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
  lineItems?: ExpenseLineItem[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseLineItem = {
  id: string;
  name: string;
  amount: number;
  source: "ocr" | "manual";
  confidence?: number;
};

export type Category = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type HouseholdRole = "owner" | "member";

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  activeHouseholdId?: string;
  lastCloudMigration?: CloudMigrationRecord;
  createdAt: string;
  updatedAt: string;
};

export type CloudMigrationRecord = {
  householdId: string;
  expenses: number;
  categories: number;
  shopCategoryRules: number;
  completedAt: string;
  warnings?: string[];
};

export type Household = {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
};

export type HouseholdMember = {
  householdId: string;
  uid: string;
  role: HouseholdRole;
  joinedAt: string;
  displayName?: string;
  email?: string;
  inviteCode?: string;
};

export type HouseholdInvite = {
  code: string;
  householdId: string;
  createdByUid: string;
  createdAt: string;
  expiresAt: string;
  status: "active" | "used";
  usedByUid?: string;
  usedAt?: string;
};

export type CloudExpense = Expense & {
  householdId: string;
  createdByUid: string;
  updatedByUid: string;
};

export type CloudCategory = Category & {
  householdId: string;
  createdAt: string;
  updatedAt: string;
};

export type CloudShopCategoryRule = ShopCategoryRule & {
  householdId: string;
};

export type SheetSyncSettings = {
  householdId: string;
  spreadsheetId: string;
  enabled: boolean;
  lastSyncedAt?: string;
  updatedAt: string;
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
  lineItemCandidates: ReceiptLineItemCandidate[];
};

export type ReceiptLineItemCandidate = {
  name: string;
  amount: number;
  line: string;
  confidence: number;
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
  lineItems?: ExpenseLineItem[];
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
