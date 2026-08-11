import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const metricsUrl = "http://127.0.0.1:4174/tests/e2e/harness/?screen=quality-metrics";

test("個人情報を含まない自動登録集計を端末内で確認・分離・消去できる", async ({ page }) => {
  await page.goto(metricsUrl);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByText("今月のレシート読み取りはまだありません")).toBeVisible();
  await page.getByTestId("record-auto-save").click();
  await page.getByTestId("record-auto-save").click();
  await page.getByTestId("record-review").click();
  await page.getByTestId("record-batch-review").click();
  await page.getByTestId("record-undo").click();
  await page.getByTestId("record-correction").click();

  await expect(page.getByText("読み取ったレシート").locator("..")).toContainText("4件");
  await expect(page.getByText("自動登録", { exact: true }).locator("..")).toContainText("2件 / 50%");
  await expect(page.getByText("確認が必要", { exact: true }).locator("..")).toContainText("2件");
  await expect(page.getByText("自動登録を元に戻した割合").locator("..")).toContainText("1件 / 50%");
  await expect(page.getByText("確認時に総額を直した割合").locator("..")).toContainText("1件 / 100%");
  await expect(page.getByText("支払総額の候補が競合").locator("..")).toContainText("1件");
  await expect(page.getByText("カテゴリを判断できない").locator("..")).toContainText("1件");
  await expect(page.getByText("複数枚のため確認").locator("..")).toContainText("1件");

  await page.reload();
  await expect(page.getByText("読み取ったレシート").locator("..")).toContainText("4件");

  await page.goto(`${metricsUrl}&scope=household:other`);
  await expect(page.getByText("今月のレシート読み取りはまだありません")).toBeVisible();

  await page.goto(metricsUrl);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この端末の集計を消去" }).click();
  await expect(page.getByText("今月のレシート読み取りはまだありません")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
