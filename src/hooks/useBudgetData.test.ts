import { describe, expect, it } from "vitest";
import {
  getRepositoryErrorCode,
  isPermissionDeniedRepositoryError,
  isRetryableRepositoryError,
} from "./useBudgetData";

describe("budget repository error classification", () => {
  it("separates permission errors from temporary connection errors", () => {
    expect(isPermissionDeniedRepositoryError({ code: "firestore/permission-denied" })).toBe(true);
    expect(isRetryableRepositoryError({ code: "firestore/permission-denied" })).toBe(false);
    expect(isRetryableRepositoryError({ code: "firestore/unavailable" })).toBe(true);
    expect(isRetryableRepositoryError({ code: "firestore/deadline-exceeded" })).toBe(true);
  });

  it("returns an empty code for unknown errors", () => {
    expect(getRepositoryErrorCode(new Error("unknown"))).toBe("");
  });
});
