import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter, parseNonNegativeInteger } from "../src/rateLimit.js";

describe("OCR rate limit", () => {
  it("parses non-negative integer settings", () => {
    expect(parseNonNegativeInteger("10", 5)).toBe(10);
    expect(parseNonNegativeInteger("0", 5)).toBe(0);
    expect(parseNonNegativeInteger("-1", 5)).toBe(5);
    expect(parseNonNegativeInteger("invalid", 5)).toBe(5);
  });

  it("rejects requests over the per-user window and resets after expiry", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000);

    expect(limiter.consume("uid:user-1", 0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("uid:user-1", 1_000)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("uid:user-1", 2_000)).toMatchObject({ allowed: false, retryAfterSeconds: 58 });
    expect(limiter.consume("uid:user-1", 60_000)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("tracks different users independently", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);

    expect(limiter.consume("uid:user-1", 0).allowed).toBe(true);
    expect(limiter.consume("uid:user-1", 1).allowed).toBe(false);
    expect(limiter.consume("uid:user-2", 1).allowed).toBe(true);
  });
});
