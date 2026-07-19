import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parseNonNegativeInteger } from "./rateLimit.js";

export type MonthlyUsageDecision = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  period: string;
};

export type MonthlyUsageQuota = {
  consume: (now?: Date) => Promise<MonthlyUsageDecision>;
};

export function parseMonthlyUsageLimit(value: string | undefined, fallback = 900): number {
  return parseNonNegativeInteger(value, fallback);
}

export function getUtcMonthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function decideMonthlyUsage(currentCount: unknown, limit: number, period: string): MonthlyUsageDecision {
  const used = typeof currentCount === "number" && Number.isInteger(currentCount) && currentCount >= 0
    ? currentCount
    : 0;

  if (limit === 0) {
    return { allowed: true, limit, used, remaining: 0, period };
  }

  const allowed = used < limit;
  return {
    allowed,
    limit,
    used: allowed ? used + 1 : used,
    remaining: Math.max(0, limit - (allowed ? used + 1 : used)),
    period,
  };
}

function ensureFirebaseAdminApp(): void {
  if (getApps().length === 0) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
    });
  }
}

export function createFirestoreMonthlyUsageQuota(limit: number): MonthlyUsageQuota {
  ensureFirebaseAdminApp();
  const firestore = getFirestore();

  return {
    consume: async (now = new Date()) => {
      const period = getUtcMonthKey(now);
      if (limit === 0) {
        return decideMonthlyUsage(0, limit, period);
      }

      const usageRef = firestore.doc(`ocrUsage/${period}`);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(usageRef);
        const decision = decideMonthlyUsage(snapshot.data()?.count, limit, period);
        if (decision.allowed) {
          transaction.set(usageRef, {
            period,
            count: decision.used,
            updatedAt: now.toISOString(),
          }, { merge: true });
        }
        return decision;
      });
    },
  };
}
