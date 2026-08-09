import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

test("OCR確認画面で候補を修正して保存できる", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/");

  await expect(page.getByRole("heading", { name: "読み取り結果の確認", level: 1 })).toBeVisible();
  await expect(page.getByText("店舗ルールを反映: 食費", { exact: true })).toBeVisible();
  const form = page.locator("form.form-stack");
  const shopNameInput = form.getByRole("textbox", { name: "店舗名", exact: true });
  const amountInputs = form.getByRole("spinbutton", { name: "金額", exact: true });
  await expect(shopNameInput).toHaveValue("サンプルストア");
  await expect(amountInputs.first()).toHaveValue("500");
  await expect(page.locator("pre.ocr-text")).toContainText("サンプル商品A 300");

  await shopNameInput.fill("サンプルストア本店");
  await amountInputs.first().fill("550");
  await form.getByRole("textbox", { name: "メモ", exact: true }).fill("確認済み");
  await page.locator("details.line-item-editor > summary").click();
  await form.getByRole("textbox", { name: "品目名", exact: true }).first().fill("サンプル商品A（修正）");
  await amountInputs.nth(1).fill("350");
  await page.getByRole("checkbox", { name: /この店舗のカテゴリを次回も使う/ }).uncheck();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const saveResult = page.getByTestId("save-result");
  await expect(saveResult).toBeVisible();
  const saved = JSON.parse((await saveResult.textContent()) ?? "{}");
  expect(saved).toMatchObject({
    values: {
      shopName: "サンプルストア本店",
      amount: 550,
      memo: "確認済み",
      lineItems: [
        { name: "サンプル商品A（修正）", amount: 350, source: "ocr" },
        { name: "サンプル商品B", amount: 200, source: "ocr" },
      ],
    },
    options: { saveCategoryRule: false },
  });
  await expectNoHorizontalOverflow(page);
});
