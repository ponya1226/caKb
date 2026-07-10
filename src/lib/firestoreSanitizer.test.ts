import { describe, expect, it } from "vitest";
import { removeUndefinedFields } from "./firestoreSanitizer";

describe("removeUndefinedFields", () => {
  it("removes undefined fields from nested Firestore payloads", () => {
    const payload = {
      id: "expense_1",
      receiptImageId: undefined,
      lineItems: [
        {
          id: "line_1",
          name: "品目A",
          amount: 100,
          confidence: undefined,
        },
      ],
      nested: {
        keep: "value",
        drop: undefined,
      },
    };

    expect(removeUndefinedFields(payload)).toEqual({
      id: "expense_1",
      lineItems: [
        {
          id: "line_1",
          name: "品目A",
          amount: 100,
        },
      ],
      nested: {
        keep: "value",
      },
    });
  });
});
