import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l1cF8QAAAABJRU5ErkJggg==",
  "base64",
);

async function uploadFixtureReceipt(page: Page) {
  await page.getByLabel("読み取るレシート画像を選択").setInputFiles({
    name: "anonymous-receipt.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
}

test("確信度が高い単体レシートを確認画面なしで登録し元に戻せる", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4174",
  });
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/?screen=capture-high");
  await uploadFixtureReceipt(page);

  await expect(page.getByText("登録しました", { exact: true })).toBeVisible();
  await expect(page.getByText("サンプルストア / ¥500", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "読み取り結果の確認" })).toHaveCount(0);
  await page.getByRole("button", { name: "品目・合計" }).click();
  const recognitionReport = await page.evaluate(() => navigator.clipboard.readText());
  expect(recognitionReport).toContain("合計金額: ￥500");
  expect(recognitionReport).toContain("サンプル商品 / ￥500");
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(page.getByTestId("undo-result")).toHaveText("取り消しました");
  await expectNoHorizontalOverflow(page);
});

test("カテゴリを判断できない単体レシートを理由付き確認画面へ送る", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/?screen=capture-low");
  await uploadFixtureReceipt(page);

  await expect(page.getByRole("heading", { name: "読み取り結果の確認", level: 1 })).toBeVisible();
  await expect(page.getByText("確認が必要なレシートです", { exact: true })).toBeVisible();
  await expect(page.getByText("この店舗のカテゴリを選んでください", { exact: true })).toBeVisible();
  await expect(page.getByText("登録しました", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
