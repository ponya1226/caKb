import type { BackupImportMode, Category, Expense, ReceiptImage, ShopCategoryRule } from "../../types";

export type BudgetSnapshot = {
  categories: Category[];
  expenses: Expense[];
  shopCategoryRules: ShopCategoryRule[];
};

export type ExpenseMutationOptions = {
  expectedUpdatedAt?: string;
};

export class BudgetConflictError extends Error {
  readonly code = "budget-conflict";

  constructor() {
    super("別の利用者が更新しました。最新版を確認してから、もう一度編集してください。");
    this.name = "BudgetConflictError";
  }
}

export type BudgetRepository = {
  initialize: () => Promise<void>;
  getSnapshot: () => Promise<BudgetSnapshot>;
  subscribe?: (
    listener: (snapshot: BudgetSnapshot) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  saveExpense: (expense: Expense, options?: ExpenseMutationOptions) => Promise<void>;
  deleteExpense: (id: string, options?: ExpenseMutationOptions) => Promise<void>;
  saveReceiptImage: (receiptImage: ReceiptImage) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  saveShopCategoryRule: (rule: ShopCategoryRule) => Promise<void>;
  deleteShopCategoryRule: (id: string) => Promise<void>;
  importApplicationData: (
    expenses: Expense[],
    categories: Category[],
    shopCategoryRules: ShopCategoryRule[],
    mode: BackupImportMode,
  ) => Promise<void>;
  clearApplicationData: () => Promise<void>;
};
