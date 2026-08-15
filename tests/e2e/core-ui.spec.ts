import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

test("レシート画面をGoogleの文字読み取りに固定する", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/?screen=capture-high");

  await expect(page.getByRole("heading", { name: "レシート登録", level: 1 })).toBeVisible();
  await expect(page.getByText("オンラインでレシートを読み取ります")).toBeVisible();
  await expect(page.getByText(/画像はGoogleの文字読み取りサービスへ送信/)).toBeVisible();
  await expect(page.getByRole("button", { name: "撮影", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "アップロード", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "レシートを読み取る" })).toBeDisabled();

  for (const removedLabel of ["高精度OCR", "ローカルOCR", "OCR方式", "OCR範囲", "画像補正", "自動範囲"]) {
    await expect(page.getByText(removedLabel, { exact: true })).toHaveCount(0);
  }

  await expectNoHorizontalOverflow(page);
});

test("専用test harnessで支出を登録・編集・削除できる", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/?screen=budget-crud");
  await page.getByRole("button", { name: "支出を追加" }).click();

  const dialog = page.getByRole("dialog", { name: "支出の追加" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("店舗名").fill("E2Eテスト店舗");
  await dialog.getByLabel("金額", { exact: true }).fill("1200");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();

  const expense = page.getByRole("article");
  await expect(expense.getByText("E2Eテスト店舗", { exact: true })).toBeVisible();
  await expect(expense.getByText("￥1,200", { exact: true })).toBeVisible();

  await expense.getByRole("button", { name: "編集" }).click();
  const editDialog = page.getByRole("dialog", { name: "支出の編集" });
  await editDialog.getByLabel("店舗名").fill("E2E更新店舗");
  await editDialog.getByLabel("金額", { exact: true }).fill("1500");
  await editDialog.getByRole("button", { name: "更新" }).click();
  await expect(editDialog).toBeHidden();
  await expect(expense.getByText("E2E更新店舗", { exact: true })).toBeVisible();
  await expect(expense.getByText("￥1,500", { exact: true })).toBeVisible();

  page.once("dialog", async (confirmation) => {
    expect(confirmation.message()).toBe("この支出を削除しますか？");
    await confirmation.accept();
  });
  await expense.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText("この月の支出はありません", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("長い品目明細の再編集で入力欄までスクロールできる", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/tests/e2e/harness/?screen=long-expense-edit");
  await page.getByRole("button", { name: "編集" }).click();

  const editDialog = page.getByRole("dialog", { name: "支出の編集" });
  const modalPanel = editDialog.locator("xpath=.");
  await expect(editDialog.locator("details.line-item-editor")).toHaveAttribute("open", "");
  const lastItemInput = editDialog.getByLabel("品目名", { exact: true }).last();

  await expect.poll(async () => modalPanel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await lastItemInput.scrollIntoViewIfNeeded();
  await lastItemInput.focus();

  const visibility = await lastItemInput.evaluate((element) => {
    const fieldRect = element.getBoundingClientRect();
    const panel = element.closest(".modal-panel");
    const panelRect = panel?.getBoundingClientRect();
    return {
      panelScrollTop: panel?.scrollTop ?? 0,
      insidePanel: Boolean(panelRect && fieldRect.top >= panelRect.top && fieldRect.bottom <= panelRect.bottom),
      insideViewport: fieldRect.top >= 0 && fieldRect.bottom <= window.innerHeight,
    };
  });

  expect(visibility.panelScrollTop).toBeGreaterThan(0);
  expect(visibility.insidePanel).toBe(true);
  expect(visibility.insideViewport).toBe(true);
  await expectNoHorizontalOverflow(page);
});
