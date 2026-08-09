export type ExpenseSource = "manual" | "receipt";

export type OcrProvider = "googleVision";

export type OcrTextBlock = {
  text: string;
  granularity?: "word";
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
  createdByUid?: string;
  updatedByUid?: string;
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

export type CloudConnectionState = {
  status: "online" | "offline" | "reconnecting" | "permissionDenied";
  lastSuccessfulSyncAt?: string;
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
  lastExportedExpenseCount?: number;
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
  riskSignals: ReceiptParseRiskSignals;
};

export type ReceiptParseRiskSignals = {
  balanceAmounts: number[];
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

export type ReceiptLineItemConsistency = "consistent" | "unknown" | "inconsistent";

export type ReceiptConfidenceSignals = {
  ocrSucceeded: boolean;
  totalResolved: boolean;
  dateResolved: boolean;
  merchantResolved: boolean;
  categoryResolved: boolean;
  conflictingAmounts: boolean;
  conflictingMerchants: boolean;
  suspiciousBalanceCandidate: boolean;
  lineItemConsistency: ReceiptLineItemConsistency;
};

export type ReceiptConfidenceReasonCode =
  | "ocr_failed"
  | "total_missing"
  | "total_uncertain"
  | "total_conflict"
  | "total_unrealistic"
  | "balance_detected"
  | "date_missing"
  | "date_out_of_range"
  | "merchant_missing"
  | "merchant_uncertain"
  | "merchant_conflict"
  | "category_unresolved"
  | "line_items_inconsistent";

export type ReceiptConfidenceReason = {
  code: ReceiptConfidenceReasonCode;
  message: string;
  severity: "blocking" | "warning";
};

export type ReceiptConfidenceAssessment = {
  decision: "autoSave" | "needsReview";
  signals: ReceiptConfidenceSignals;
  reasons: ReceiptConfidenceReason[];
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
  ocrBlocks?: OcrTextBlock[];
  ocrText: string;
  parseResult: ReceiptParseResult;
  initialValues: ExpenseFormValues;
  categorySuggestion?: ReceiptCategorySuggestion;
  confidenceAssessment?: ReceiptConfidenceAssessment;
};
