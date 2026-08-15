import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const metricsUrl = "http://127.0.0.1:4174/tests/e2e/harness/?screen=quality-metrics";
const storageKey = "cakb-receipt-quality-metrics-v2";

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

test("個人情報を含まない自動登録集計を月別・判定ルール別に確認、コピー、分離、消去できる", async ({ page }) => {
  const previousMonth = new Date();
  previousMonth.setDate(1);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousMonthKey = monthKey(previousMonth);
  const previousMonthLabel = `${previousMonth.getFullYear()}年${previousMonth.getMonth() + 1}月`;

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4174",
  });
  await page.goto(metricsUrl);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByText(/のレシート読み取りはありません/)).toBeVisible();
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

  await page.getByText("判定ルール別の内訳").click();
  await expect(page.getByText("receipt-confidence-v3", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "集計をコピー" }).click();
  await expect(page.getByText("コピーしました", { exact: true })).toBeVisible();
  const copiedReport = await page.evaluate(() => navigator.clipboard.readText());
  expect(copiedReport).toContain("caKb 自動登録状況");
  expect(copiedReport).toContain("読み取ったレシート: 4件");
  expect(copiedReport).toContain("receipt-confidence-v3");
  expect(copiedReport).not.toContain("household:e2e");

  await page.evaluate(({ key, scopeKey, priorMonthKey }) => {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    stored.scopes[scopeKey].months[priorMonthKey] = {
      policies: {
        "receipt-confidence-v1": {
          processed: 1,
          autoSaved: 1,
          needsReview: 0,
          autoSaveUndone: 0,
          reviewsSaved: 0,
          reviewTotalsCorrected: 0,
          reviewsDiscarded: 0,
          reviewReasons: {},
        },
      },
    };
    window.localStorage.setItem(key, JSON.stringify(stored));
  }, { key: storageKey, scopeKey: "household:e2e", priorMonthKey: previousMonthKey });
  await page.reload();
  await page.getByLabel("表示する月").selectOption(previousMonthKey);
  await expect(page.getByText("読み取ったレシート").locator("..")).toContainText("1件");
  await expect(page.getByLabel("表示する月")).toHaveValue(previousMonthKey);
  await expect(page.getByRole("option", { name: previousMonthLabel })).toHaveCount(1);

  await page.goto(`${metricsUrl}&readonly=1`);
  await expect(page.getByRole("button", { name: "集計をコピー" })).toBeVisible();
  await expect(page.getByRole("button", { name: "この端末の集計を消去" })).toHaveCount(0);
  await expect(page.getByTestId("record-auto-save")).toHaveCount(0);

  await page.goto(`${metricsUrl}&scope=household:other`);
  await expect(page.getByText(/のレシート読み取りはありません/)).toBeVisible();

  await page.goto(metricsUrl);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "この端末の集計を消去" }).click();
  await expect(page.getByText(/のレシート読み取りはありません/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
