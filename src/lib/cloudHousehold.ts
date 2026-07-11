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
  CloudMigrationRecord,
  CloudShopCategoryRule,
  Expense,
  Household,
  HouseholdMember,
  ShopCategoryRule,
  UserProfile,
} from "../types";
import { removeUndefinedFields } from "./firestoreSanitizer";
import { createId } from "./id";
import {
  householdCategoriesPath,
  householdExpensesPath,
  householdMemberPath,
  householdPath,
  householdShopCategoryRulesPath,
  userProfilePath,
} from "./firestorePaths";

const FIRESTORE_BATCH_LIMIT = 450;

export type CloudHouseholdSummary = {
  household: Household;
  member: HouseholdMember;
  lastMigration?: CloudMigrationRecord;
};

export type CloudMigrationSummary = CloudMigrationRecord;

export type CloudUser = {
  uid: string;
  displayName: string;
};

async function getHouseholdSummaryById(
  firestore: Firestore,
  householdId: string,
  uid: string,
): Promise<CloudHouseholdSummary | null> {
  const [householdSnapshot, memberSnapshot, userSnapshot] = await Promise.all([
    getDoc(doc(firestore, householdPath(householdId))),
    getDoc(doc(firestore, householdMemberPath(householdId, uid))),
    getDoc(doc(firestore, userProfilePath(uid))),
  ]);

  if (!householdSnapshot.exists() || !memberSnapshot.exists()) {
    return null;
  }

  const lastMigration = userSnapshot.exists()
    ? (userSnapshot.data() as Partial<UserProfile>).lastCloudMigration
    : undefined;

  return {
    household: householdSnapshot.data() as Household,
    member: memberSnapshot.data() as HouseholdMember,
    ...(lastMigration?.householdId === householdId ? { lastMigration } : {}),
  };
}

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
  await setDoc(
    doc(firestore, userProfilePath(user.uid)),
    {
      activeHouseholdId: household.id,
      updatedAt: now,
    },
    { merge: true },
  );

  return { household, member };
}

export async function findFirstHouseholdForUser(firestore: Firestore, uid: string): Promise<CloudHouseholdSummary | null> {
  const userSnapshot = await getDoc(doc(firestore, userProfilePath(uid)));
  const activeHouseholdId = userSnapshot.exists() ? (userSnapshot.data() as Partial<UserProfile>).activeHouseholdId : undefined;
  if (activeHouseholdId) {
    const activeHousehold = await getHouseholdSummaryById(firestore, activeHouseholdId, uid);
    if (activeHousehold) {
      return activeHousehold;
    }
  }

  let memberSnapshots;
  try {
    const memberQuery = query(collectionGroup(firestore, "members"), where("uid", "==", uid));
    memberSnapshots = await getDocs(memberQuery);
  } catch {
    return null;
  }

  const memberSnapshot = memberSnapshots.docs[0];

  if (!memberSnapshot) {
    return null;
  }

  const member = memberSnapshot.data() as HouseholdMember;
  const householdSnapshot = await getDoc(doc(firestore, householdPath(member.householdId)));
  if (!householdSnapshot.exists()) {
    return null;
  }

  await setDoc(doc(firestore, userProfilePath(uid)), { activeHouseholdId: member.householdId }, { merge: true });

  const lastMigration = userSnapshot.exists()
    ? (userSnapshot.data() as Partial<UserProfile>).lastCloudMigration
    : undefined;

  return {
    household: householdSnapshot.data() as Household,
    member,
    ...(lastMigration?.householdId === member.householdId ? { lastMigration } : {}),
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
  const cloudExpenses = expenses.map((expense) => removeUndefinedFields(toCloudExpense(expense, householdId, uid)));
  const cloudCategories = categories.map((category) => removeUndefinedFields(toCloudCategory(category, householdId, now)));
  const cloudShopCategoryRules = (settings.shopCategoryRules ?? []).map((rule) =>
    removeUndefinedFields(toCloudShopCategoryRule(rule, householdId)),
  );

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

  const warnings: string[] = [];
  let migratedShopCategoryRules = cloudShopCategoryRules.length;

  try {
    await commitBatchItems(
      cloudShopCategoryRules,
      (batch, rule) => {
        batch.set(doc(firestore, householdShopCategoryRulesPath(householdId), rule.id), rule);
      },
      firestore,
    );
  } catch (unknownError) {
    migratedShopCategoryRules = 0;
    warnings.push("店舗別カテゴリルールは移行できませんでした。支出とカテゴリは移行済みです。");
  }

  const summary: CloudMigrationSummary = {
    householdId,
    expenses: cloudExpenses.length,
    categories: cloudCategories.length,
    shopCategoryRules: migratedShopCategoryRules,
    completedAt: now,
    ...(warnings.length > 0 ? { warnings } : {}),
  };

  await setDoc(
    doc(firestore, userProfilePath(uid)),
    { lastCloudMigration: summary, updatedAt: now },
    { merge: true },
  );

  return summary;
}
