import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  runTransaction,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import type { HouseholdInvite, HouseholdMember } from "../types";
import type { CloudUser } from "./cloudHousehold";
import {
  householdInvitePath,
  householdMemberPath,
  householdMembersPath,
  userProfilePath,
} from "./firestorePaths";

const INVITE_CODE_LENGTH = 8;
const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_VALIDITY_MS = 24 * 60 * 60 * 1000;

type FirestoreHouseholdInvite = Omit<HouseholdInvite, "createdAt" | "expiresAt" | "usedAt"> & {
  createdAt: Timestamp;
  expiresAt: Timestamp;
  usedAt?: Timestamp;
};

export function normalizeInviteCode(value: string): string {
  return value.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function createInviteCode(randomValues?: Uint32Array): string {
  const values = randomValues ?? crypto.getRandomValues(new Uint32Array(INVITE_CODE_LENGTH));
  return Array.from(values, (value) => INVITE_ALPHABET[value % INVITE_ALPHABET.length]).join("");
}

function toHouseholdInvite(invite: FirestoreHouseholdInvite): HouseholdInvite {
  const { createdAt, expiresAt, usedAt, ...values } = invite;
  return {
    ...values,
    createdAt: createdAt.toDate().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
    ...(usedAt ? { usedAt: usedAt.toDate().toISOString() } : {}),
  };
}

export async function createHouseholdInvite(
  firestore: Firestore,
  householdId: string,
  ownerUid: string,
): Promise<HouseholdInvite> {
  const now = Date.now();
  const code = createInviteCode();
  const invite: FirestoreHouseholdInvite = {
    code,
    householdId,
    createdByUid: ownerUid,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + INVITE_VALIDITY_MS),
    status: "active",
  };

  await setDoc(doc(firestore, householdInvitePath(code)), invite);
  return toHouseholdInvite(invite);
}

export async function joinHouseholdWithInvite(
  firestore: Firestore,
  user: CloudUser,
  rawCode: string,
): Promise<string> {
  const code = normalizeInviteCode(rawCode);
  if (code.length !== INVITE_CODE_LENGTH) {
    throw new Error("invalid-invite-code");
  }

  const inviteRef = doc(firestore, householdInvitePath(code));
  return runTransaction(firestore, async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteRef);
    if (!inviteSnapshot.exists()) {
      throw new Error("invite-not-found");
    }

    const invite = inviteSnapshot.data() as FirestoreHouseholdInvite;
    if (invite.status !== "active") {
      throw new Error("invite-used");
    }
    if (invite.expiresAt.toMillis() <= Date.now()) {
      throw new Error("invite-expired");
    }

    const now = new Date().toISOString();
    const member: HouseholdMember = {
      householdId: invite.householdId,
      uid: user.uid,
      role: "member",
      joinedAt: now,
      displayName: user.displayName,
      ...(user.email ? { email: user.email } : {}),
      inviteCode: code,
    };

    transaction.set(doc(firestore, householdMemberPath(invite.householdId, user.uid)), member);
    transaction.update(inviteRef, {
      status: "used",
      usedByUid: user.uid,
      usedAt: Timestamp.now(),
    });
    transaction.set(
      doc(firestore, userProfilePath(user.uid)),
      { activeHouseholdId: invite.householdId, updatedAt: now },
      { merge: true },
    );

    return invite.householdId;
  });
}

export async function listHouseholdMembers(
  firestore: Firestore,
  householdId: string,
): Promise<HouseholdMember[]> {
  const snapshot = await getDocs(collection(firestore, householdMembersPath(householdId)));
  return snapshot.docs
    .map((memberSnapshot) => memberSnapshot.data() as HouseholdMember)
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
}

export async function removeHouseholdMember(
  firestore: Firestore,
  householdId: string,
  uid: string,
): Promise<void> {
  await deleteDoc(doc(firestore, householdMemberPath(householdId, uid)));
}
