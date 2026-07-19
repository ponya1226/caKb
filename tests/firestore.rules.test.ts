import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: "demo-cakb",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

async function seedHousehold(): Promise<void> {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, "households/household-1"), {
      id: "household-1",
      name: "Test household",
      ownerUid: "owner-1",
    });
    await setDoc(doc(firestore, "households/household-1/members/owner-1"), {
      householdId: "household-1",
      uid: "owner-1",
      role: "owner",
    });
    await setDoc(doc(firestore, "households/household-1/members/member-1"), {
      householdId: "household-1",
      uid: "member-1",
      role: "member",
    });
  });
}

describe("Firestore household rules", () => {
  it("allows household members to read and write expenses", async () => {
    await seedHousehold();
    const firestore = testEnvironment.authenticatedContext("member-1").firestore();
    const expenseRef = doc(firestore, "households/household-1/expenses/expense-1");

    await assertSucceeds(setDoc(expenseRef, { amount: 481, shopName: "Sample Store" }));
    await assertSucceeds(getDoc(expenseRef));
  });

  it("rejects access from a user outside the household", async () => {
    await seedHousehold();
    const firestore = testEnvironment.authenticatedContext("outsider-1").firestore();

    await assertFails(getDoc(doc(firestore, "households/household-1/expenses/expense-1")));
    await assertFails(
      setDoc(doc(firestore, "households/household-1/categories/category-1"), { name: "Food" }),
    );
  });

  it("does not expose server-managed OCR usage counters to clients", async () => {
    await seedHousehold();
    const memberFirestore = testEnvironment.authenticatedContext("member-1").firestore();
    const usageRef = doc(memberFirestore, "ocrUsage/2026-07");

    await assertFails(getDoc(usageRef));
    await assertFails(setDoc(usageRef, { count: 1 }));
  });

  it("shares shop category rules only with household members", async () => {
    await seedHousehold();
    const memberFirestore = testEnvironment.authenticatedContext("member-1").firestore();
    const outsiderFirestore = testEnvironment.authenticatedContext("outsider-1").firestore();
    const rulePath = "households/household-1/shopCategoryRules/rule-1";

    await assertSucceeds(
      setDoc(doc(memberFirestore, rulePath), {
        id: "rule-1",
        householdId: "household-1",
        shopName: "Sample Store",
        normalizedShopName: "samplestore",
        categoryId: "food",
      }),
    );
    await assertSucceeds(getDoc(doc(memberFirestore, rulePath)));
    await assertFails(getDoc(doc(outsiderFirestore, rulePath)));
    await assertFails(setDoc(doc(outsiderFirestore, rulePath), { categoryId: "other" }, { merge: true }));
  });

  it("revokes expense access after a member is removed", async () => {
    await seedHousehold();
    const memberFirestore = testEnvironment.authenticatedContext("member-1").firestore();
    const expenseRef = doc(memberFirestore, "households/household-1/expenses/expense-1");
    await assertSucceeds(setDoc(expenseRef, { amount: 481, shopName: "Sample Store" }));

    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), "households/household-1/members/member-1"));
    });

    await assertFails(getDoc(expenseRef));
    await assertFails(setDoc(expenseRef, { amount: 500 }, { merge: true }));
  });

  it("allows only the owner to update members", async () => {
    await seedHousehold();
    const ownerFirestore = testEnvironment.authenticatedContext("owner-1").firestore();
    const memberFirestore = testEnvironment.authenticatedContext("member-1").firestore();
    const targetPath = "households/household-1/members/member-1";

    await assertSucceeds(setDoc(doc(ownerFirestore, targetPath), { role: "member" }, { merge: true }));
    await assertFails(setDoc(doc(memberFirestore, targetPath), { role: "owner" }, { merge: true }));
  });

  it("allows an authenticated user to join with an active one-time invite", async () => {
    await seedHousehold();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "householdInvites/ABCDEFGH"), {
        code: "ABCDEFGH",
        householdId: "household-1",
        createdByUid: "owner-1",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
        status: "active",
      });
    });

    const firestore = testEnvironment.authenticatedContext("new-member-1").firestore();
    await assertSucceeds(
      runTransaction(firestore, async (transaction) => {
        const inviteRef = doc(firestore, "householdInvites/ABCDEFGH");
        await transaction.get(inviteRef);
        transaction.set(doc(firestore, "households/household-1/members/new-member-1"), {
          householdId: "household-1",
          uid: "new-member-1",
          role: "member",
          joinedAt: "2026-07-11T00:00:00.000Z",
          inviteCode: "ABCDEFGH",
        });
        transaction.update(inviteRef, {
          status: "used",
          usedByUid: "new-member-1",
          usedAt: Timestamp.now(),
        });
      }),
    );
  });

  it("rejects direct membership creation and invite listing", async () => {
    await seedHousehold();
    const firestore = testEnvironment.authenticatedContext("outsider-1").firestore();

    await assertFails(
      setDoc(doc(firestore, "households/household-1/members/outsider-1"), {
        householdId: "household-1",
        uid: "outsider-1",
        role: "member",
        inviteCode: "MISSING1",
      }),
    );
    await assertFails(getDocs(collection(firestore, "householdInvites")));
  });
});
