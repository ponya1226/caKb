import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./testUtils";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "主要画面" })).toBeVisible();
});

test("一般利用者向けのアカウント画面を表示する", async ({ page }) => {
  const navigation = page.getByRole("navigation", { name: "主要画面" });

  await expect(page.getByRole("heading", { name: "今月の家計", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "レシートを撮る", exact: true })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "ホーム" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "一覧" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "年間" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "レシート" })).toBeVisible();
  await navigation.getByRole("button", { name: "アカウント" }).click();

  await expect(page.getByRole("heading", { name: "アカウント", level: 1 })).toBeVisible();
  await expect(page.getByText("未ログインです。現在のデータはこの端末に保存されています。")).toBeVisible();
  await expect(page.getByText("この端末のデータ管理", { exact: true })).toBeVisible();
  await expect(page.getByText("メンバーを招待", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("レシート画面をGoogleの文字読み取りに固定する", async ({ page }) => {
  await page.getByRole("navigation", { name: "主要画面" }).getByRole("button", { name: "レシート" }).click();

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

test("この端末の支出を登録・編集・削除できる", async ({ page }) => {
  await page.getByRole("button", { name: "支出を手入力" }).click();

  const dialog = page.getByRole("dialog", { name: "支出の追加" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("店舗名").fill("E2Eテスト店舗");
  await dialog.getByLabel("金額", { exact: true }).fill("1200");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("navigation", { name: "主要画面" }).getByRole("button", { name: "一覧" }).click();
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

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe("この支出を削除しますか？");
    await dialog.accept();
  });
  await expense.getByRole("button", { name: "削除" }).click();
  await expect(page.getByText("この月の支出はありません", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
