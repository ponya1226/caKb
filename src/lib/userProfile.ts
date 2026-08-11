import type { UserProfile } from "../types";

export type FirebaseUserLike = {
  uid: string;
  displayName: string | null;
  email: string | null;
};

export function buildUserProfile(user: FirebaseUserLike, now = new Date().toISOString()): UserProfile {
  return {
    uid: user.uid,
    displayName: user.displayName?.trim() || "名前未設定",
    email: user.email?.trim() || "",
    createdAt: now,
    updatedAt: now,
  };
}
