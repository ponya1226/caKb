import { describe, expect, it } from "vitest";
import { decideMonthlyUsage, getUtcMonthKey, parseMonthlyUsageLimit } from "../src/usageQuota.js";

describe("OCR monthly usage quota", () => {
  it("uses UTC calendar months", () => {
    expect(getUtcMonthKey(new Date("2026-07-31T23:59:59.000Z"))).toBe("2026-07");
    expect(getUtcMonthKey(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08");
  });

  it("defaults to a conservative monthly limit", () => {
    expect(parseMonthlyUsageLimit(undefined)).toBe(900);
    expect(parseMonthlyUsageLimit("850")).toBe(850);
    expect(parseMonthlyUsageLimit("invalid")).toBe(900);
  });

  it("increments below the limit and rejects at the limit", () => {
    expect(decideMonthlyUsage(898, 900, "2026-07")).toEqual({
      allowed: true,
      limit: 900,
      used: 899,
      remaining: 1,
      period: "2026-07",
    });
    expect(decideMonthlyUsage(900, 900, "2026-07")).toEqual({
      allowed: false,
      limit: 900,
      used: 900,
      remaining: 0,
      period: "2026-07",
    });
  });
});
