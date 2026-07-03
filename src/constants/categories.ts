import type { Category } from "../types";

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "食費", color: "#16a34a", sortOrder: 10 },
  { id: "daily-goods", name: "日用品", color: "#0891b2", sortOrder: 20 },
  { id: "dining-out", name: "外食", color: "#f97316", sortOrder: 30 },
  { id: "transport", name: "交通費", color: "#2563eb", sortOrder: 40 },
  { id: "medical", name: "医療", color: "#dc2626", sortOrder: 50 },
  { id: "education", name: "教育", color: "#7c3aed", sortOrder: 60 },
  { id: "entertainment", name: "娯楽", color: "#db2777", sortOrder: 70 },
  { id: "fixed", name: "固定費", color: "#475569", sortOrder: 80 },
  { id: "other", name: "その他", color: "#f59e0b", sortOrder: 90 },
];

export const DEFAULT_CATEGORY_ID = "other";
