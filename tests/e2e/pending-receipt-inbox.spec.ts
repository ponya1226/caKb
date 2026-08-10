import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const harnessOrigin = "http://127.0.0.1:4174";
const inboxUrl = `${harnessOrigin}/tests/e2e/harness/?screen=pending-inbox`;

async function resetAndSeedVersionOneDatabase(page: import("@playwright/test").Page) {
  await page.goto(`${harnessOrigin}/tests/e2e/harness/`);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("local-kakeibo-pwa");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB reset was blocked"));
  }));
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("local-kakeibo-pwa", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const expenseStore = db.createObjectStore("expenses", { keyPath: "id" });
      expenseStore.createIndex("date", "date", { unique: false });
      expenseStore.createIndex("categoryId", "categoryId", { unique: false });
      expenseStore.createIndex("receiptImageId", "receiptImageId", { unique: false });
      expenseStore.put({ id: "legacy-expense", date: "2026-08-01" });
      db.createObjectStore("categories", { keyPath: "id" });
      db.createObjectStore("receiptImages", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  }));
}

test("要確認レシートを再読み込み後も復元し保存または破棄できる", async ({ page }) => {
  await resetAndSeedVersionOneDatabase(page);
  await page.goto(inboxUrl);
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const request = indexedDB.open("local-kakeibo-pwa");
    request.onsuccess = () => {
      const db = request.result;
      const getRequest = db.transaction("expenses", "readonly").objectStore("expenses").get("legacy-expense");
      getRequest.onsuccess = () => {
        db.close();
        resolve(Boolean(getRequest.result));
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  }))).toBe(true);
  await page.getByTestId("create-pending-review").click();
  await expect(page.getByRole("button", { name: /確認が必要 1件/ })).toBeVisible();

  await page.goto(`${inboxUrl}&scope=household:other`);
  await expect(page.getByRole("button", { name: /確認が必要/ })).toHaveCount(0);
  await page.goto(inboxUrl);
  await expect(page.getByRole("button", { name: /確認が必要 1件/ })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /確認が必要 1件/ }).click();
  await expect(page.getByRole("heading", { name: "読み取り結果の確認", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByTestId("pending-result")).toHaveText("確認を保存しました");
  await expect(page.getByRole("button", { name: /確認が必要/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: /確認が必要/ })).toHaveCount(0);
  await page.getByTestId("create-pending-review").click();
  await page.getByRole("button", { name: /確認が必要 1件/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この読み取りを削除" }).click();
  await expect(page.getByTestId("pending-result")).toHaveText("確認を破棄しました");

  await page.reload();
  await expect(page.getByRole("button", { name: /確認が必要/ })).toHaveCount(0);

  await page.getByTestId("create-pending-review").click();
  await expect(page.getByRole("button", { name: /確認が必要 1件/ })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("local-kakeibo-pwa");
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("pendingReceiptReviews", "readwrite");
      const store = transaction.objectStore("pendingReceiptReviews");
      const getRequest = store.getAll();
      getRequest.onsuccess = () => {
        const review = getRequest.result[0] as { expiresAt: string } | undefined;
        if (review) {
          store.put({ ...review, expiresAt: "2000-01-01T00:00:00.000Z" });
        }
      };
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  }));
  await page.reload();
  await expect(page.getByRole("button", { name: /確認が必要/ })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
