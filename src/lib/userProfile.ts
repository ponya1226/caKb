import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import type { UserProfile } from "../types";
import { userProfilePath } from "./firestorePaths";

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

export async function upsertUserProfile(firestore: Firestore, user: FirebaseUserLike): Promise<void> {
  const userRef = doc(firestore, userProfilePath(user.uid));
  const snapshot = await getDoc(userRef);
  const now = new Date().toISOString();
  const profile = buildUserProfile(user, now);

  await setDoc(
    userRef,
    {
      ...profile,
      createdAt: snapshot.exists() ? snapshot.data().createdAt ?? now : now,
      updatedAt: now,
    },
    { merge: true },
  );
}
