import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type {
  AppSettings,
  Category,
  CloudCategory,
  CloudExpense,
  CloudShopCategoryRule,
  Expense,
  Household,
  HouseholdMember,
  ShopCategoryRule,
} from "../types";
import { createId } from "./id";
import {
  householdCategoriesPath,
  householdExpensesPath,
  householdMemberPath,
  householdPath,
  householdShopCategoryRulesPath,
} from "./firestorePaths";

const FIRESTORE_BATCH_LIMIT = 450;

export type CloudHouseholdSummary = {
  household: Household;
  member: HouseholdMember;
};

export type CloudMigrationSummary = {
  expenses: number;
  categories: number;
  shopCategoryRules: number;
};

export type CloudUser = {
  uid: string;
  displayName: string;
};

export function buildHousehold(name: string, ownerUid: string, now = new Date().toISOString()): Household {
  return {
    id: createId("household"),
    name: name.trim() || "家計簿",
    ownerUid,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOwnerMember(householdId: string, uid: string, now = new Date().toISOString()): HouseholdMember {
  return {
    householdId,
    uid,
    role: "owner",
    joinedAt: now,
  };
}

export function toCloudExpense(expense: Expense, householdId: string, uid: string): CloudExpense {
  return {
    ...expense,
    householdId,
    createdByUid: uid,
    updatedByUid: uid,
  };
}

export function toCloudCategory(category: Category, householdId: string, now = new Date().toISOString()): CloudCategory {
  return {
    ...category,
    householdId,
    createdAt: now,
    updatedAt: now,
  };
}

export function toCloudShopCategoryRule(rule: ShopCategoryRule, householdId: string): CloudShopCategoryRule {
  return {
    ...rule,
    householdId,
  };
}

async function commitBatchItems<T>(
  items: T[],
  writeItem: (batch: ReturnType<typeof writeBatch>, item: T) => void,
  firestore: Firestore,
): Promise<void> {
  for (let startIndex = 0; startIndex < items.length; startIndex += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    items.slice(startIndex, startIndex + FIRESTORE_BATCH_LIMIT).forEach((item) => writeItem(batch, item));
    await batch.commit();
  }
}

export async function createHouseholdForUser(
  firestore: Firestore,
  user: CloudUser,
  name: string,
): Promise<CloudHouseholdSummary> {
  const now = new Date().toISOString();
  const household = buildHousehold(name || `${user.displayName}の家計簿`, user.uid, now);
  const member = buildOwnerMember(household.id, user.uid, now);

  await setDoc(doc(firestore, householdPath(household.id)), household);
  await setDoc(doc(firestore, householdMemberPath(household.id, user.uid)), member);

  return { household, member };
}

export async function findFirstHouseholdForUser(firestore: Firestore, uid: string): Promise<CloudHouseholdSummary | null> {
  const memberQuery = query(collectionGroup(firestore, "members"), where("uid", "==", uid));
  const memberSnapshots = await getDocs(memberQuery);
  const memberSnapshot = memberSnapshots.docs[0];

  if (!memberSnapshot) {
    return null;
  }

  const member = memberSnapshot.data() as HouseholdMember;
  const householdSnapshot = await getDoc(doc(firestore, householdPath(member.householdId)));
  if (!householdSnapshot.exists()) {
    return null;
  }

  return {
    household: householdSnapshot.data() as Household,
    member,
  };
}

export async function migrateLocalDataToHousehold(
  firestore: Firestore,
  householdId: string,
  uid: string,
  expenses: Expense[],
  categories: Category[],
  settings: AppSettings,
): Promise<CloudMigrationSummary> {
  const now = new Date().toISOString();
  const cloudExpenses = expenses.map((expense) => toCloudExpense(expense, householdId, uid));
  const cloudCategories = categories.map((category) => toCloudCategory(category, householdId, now));
  const cloudShopCategoryRules = (settings.shopCategoryRules ?? []).map((rule) => toCloudShopCategoryRule(rule, householdId));

  await commitBatchItems(
    cloudCategories,
    (batch, category) => {
      batch.set(doc(firestore, householdCategoriesPath(householdId), category.id), category);
    },
    firestore,
  );

  await commitBatchItems(
    cloudExpenses,
    (batch, expense) => {
      batch.set(doc(firestore, householdExpensesPath(householdId), expense.id), expense);
    },
    firestore,
  );

  await commitBatchItems(
    cloudShopCategoryRules,
    (batch, rule) => {
      batch.set(doc(firestore, householdShopCategoryRulesPath(householdId), rule.id), rule);
    },
    firestore,
  );

  return {
    expenses: cloudExpenses.length,
    categories: cloudCategories.length,
    shopCategoryRules: cloudShopCategoryRules.length,
  };
}
