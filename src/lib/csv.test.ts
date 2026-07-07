import { describe, expect, it } from "vitest";
import type { Category, Expense } from "../types";
import { buildExpensesCsv } from "./csv";

const categories: Category[] = [{ id: "food", name: "Food", color: "#16a34a", sortOrder: 10 }];

describe("buildExpensesCsv", () => {
  it("adds lineItemsJson as a trailing column", () => {
    const expenses: Expense[] = [
      {
        id: "expense-1",
        date: "2026-07-01",
        shopName: "Sample Store",
        amount: 481,
        categoryId: "food",
        memo: "",
        source: "receipt",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        lineItems: [
          {
            id: "line-item-1",
            name: "Potato Chips",
            amount: 168,
            source: "ocr",
            confidence: 0.9,
          },
        ],
      },
    ];

    const csv = buildExpensesCsv(expenses, categories);

    expect(csv.split("\r\n")[0]).toContain("updatedAt,lineItemsJson");
    expect(csv).toContain(
      "\"[{\"\"id\"\":\"\"line-item-1\"\",\"\"name\"\":\"\"Potato Chips\"\",\"\"amount\"\":168,\"\"source\"\":\"\"ocr\"\",\"\"confidence\"\":0.9}]\"",
    );
  });
});
