import {
  test,
  expect,
  gotoWithRetry,
  login,
  localePath,
} from "./fixtures/auth";

test.describe("Sales Receipts Duplicate", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoWithRetry(page, localePath("/sales"));
  });

  test("should show duplicate requirement and receipt download", async ({
    page,
  }) => {
    await page.locator('[data-guide="sale-open"]:visible').first().click();
    await expect(page.getByText("Descargar recibo PDF")).toBeVisible();
    await page
      .getByRole("spinbutton", { name: "Monto", exact: true })
      .fill("5000");
    await page
      .getByRole("button", { name: "Registrar cuota", exact: true })
      .click();
    const review = page.getByRole("dialog", { name: "Revisar cobro de venta" });
    await expect(
      review.getByText("Impresión duplicada obligatoria"),
    ).toBeVisible();
    await expect(review).toContainText(/5.000/);
    await review.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(review).toBeHidden();
  });
});
