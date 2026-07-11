import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

  it("allows only the owner to update members", async () => {
    await seedHousehold();
    const ownerFirestore = testEnvironment.authenticatedContext("owner-1").firestore();
    const memberFirestore = testEnvironment.authenticatedContext("member-1").firestore();
    const targetPath = "households/household-1/members/member-1";

    await assertSucceeds(setDoc(doc(ownerFirestore, targetPath), { role: "member" }, { merge: true }));
    await assertFails(setDoc(doc(memberFirestore, targetPath), { role: "owner" }, { merge: true }));
  });
});
