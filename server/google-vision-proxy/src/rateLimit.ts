export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
};

export function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    if (this.maxRequests === 0) {
      return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
    }

    const current = this.entries.get(key);
    const isExpired = !current || now - current.windowStartedAt >= this.windowMs;
    const entry = isExpired ? { count: 0, windowStartedAt: now } : current;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.windowStartedAt + this.windowMs - now) / 1000));

    if (entry.count >= this.maxRequests) {
      return { allowed: false, limit: this.maxRequests, remaining: 0, retryAfterSeconds };
    }

    entry.count += 1;
    this.entries.set(key, entry);
    this.pruneExpiredEntries(now);

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      retryAfterSeconds,
    };
  }

  private pruneExpiredEntries(now: number): void {
    if (this.entries.size < 500) {
      return;
    }

    for (const [key, entry] of this.entries) {
      if (now - entry.windowStartedAt >= this.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}
