import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const harnessOrigin = "http://127.0.0.1:4174/tests/e2e/harness/";

test("未所属の通常利用者には招待参加だけを表示する", async ({ page }) => {
  await page.goto(`${harnessOrigin}?screen=family-access`);

  await expect(page.getByRole("heading", { name: "家族の家計簿へ参加", level: 1 })).toBeVisible();
  await expect(page.getByText("管理者から受け取った招待コードを入力してください。")).toBeVisible();
  await expect(page.getByLabel("招待コード")).toBeVisible();
  await expect(page.getByRole("button", { name: "家族の家計簿へ参加" })).toBeVisible();
  await expect(page.getByLabel("新しい家計簿の名前")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "家計簿を作成" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("事前許可された管理者だけに初期作成を表示する", async ({ page }) => {
  await page.goto(`${harnessOrigin}?screen=family-bootstrap`);

  await expect(page.getByLabel("新しい家計簿の名前")).toBeVisible();
  await expect(page.getByRole("button", { name: "家計簿を作成" })).toBeVisible();
  await expect(page.getByLabel("招待コード")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
