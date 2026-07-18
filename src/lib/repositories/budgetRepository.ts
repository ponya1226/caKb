import type { BackupImportMode, Category, Expense, ReceiptImage } from "../../types";

export type BudgetSnapshot = {
  categories: Category[];
  expenses: Expense[];
};

export type BudgetRepository = {
  initialize: () => Promise<void>;
  getSnapshot: () => Promise<BudgetSnapshot>;
  subscribe?: (
    listener: (snapshot: BudgetSnapshot) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  saveExpense: (expense: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  saveReceiptImage: (receiptImage: ReceiptImage) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  importApplicationData: (expenses: Expense[], categories: Category[], mode: BackupImportMode) => Promise<void>;
  clearApplicationData: () => Promise<void>;
};
