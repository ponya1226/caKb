import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const isDeployedBuild = Boolean(process.env.E2E_BASE_URL);

test("クラウド接続またはGoogleログインなしでは家計画面を表示しない", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("caKb 家族の家計簿");

  if (isDeployedBuild) {
    await expect(page.getByRole("heading", { name: "家計簿をはじめる", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Googleでログイン" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "アプリを利用できません", level: 1 })).toBeVisible();
    await expect(page.getByText("クラウド家計簿の接続設定が見つかりません。管理者へお問い合わせください。")).toBeVisible();
  }

  await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "支出を手入力" })).toHaveCount(0);
  await expect(page.getByText("この端末の家計簿", { exact: true })).toHaveCount(0);
  const databaseNames = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );
  expect(databaseNames).not.toContain("local-kakeibo-pwa");
  await expectNoHorizontalOverflow(page);
});

test("接続が切れた場合は家計操作を隠して再接続を案内する", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await expect(page.getByRole("heading", { name: "インターネット接続が必要です", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要画面" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "支出を手入力" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await context.setOffline(false);
});
