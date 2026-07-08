import type { Page } from "@playwright/test";
import {
  test,
  expect,
  gotoWithRetry,
  login,
  localePath,
} from "./fixtures/auth";

function firstLeaseCard(page: Page) {
  return page
    .locator("section button")
    .filter({ hasText: /Alertas de renovación/ })
    .first();
}

async function openFirstLease(page: Page) {
  const card = firstLeaseCard(page);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click({ force: true });
  await expect(page).toHaveURL(/\/es\/leases\/[^/]+$/);
}

test.describe("Lease Creation Flow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoWithRetry(page, localePath("/leases"));
  });

  test("should display leases list page", async ({ page }) => {
    await expect(page).toHaveURL(/\/es\/leases/);
    await expect(
      page.getByRole("heading", { name: /leases|contratos/i }),
    ).toBeVisible();
  });

  test("should navigate to create lease page", async ({ page }) => {
    // New flow: create lease action is exposed from property context
    await gotoWithRetry(page, localePath("/properties"));
    const createLeaseFromProperty = page
      .locator('a[href*="/leases/new?propertyId="]')
      .first();

    if ((await createLeaseFromProperty.count()) > 0) {
      await createLeaseFromProperty.click({ force: true });
    } else {
      // Fallback for datasets where no property is currently eligible for "create lease"
      await gotoWithRetry(page, localePath("/leases/new"));
    }

    // Should navigate to new lease page
    await expect(page).toHaveURL(/\/es\/leases\/new/);
  });

  test("should display lease creation form", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases/new"));

    // Check form elements are visible
    await expect(page.getByLabel(/property|propiedad/i)).toBeVisible();
    await expect(page.getByLabel(/tenant|inquilino/i)).toBeVisible();
    await expect(page.getByLabel(/start date|fecha.*inicio/i)).toBeVisible();
    await expect(page.getByLabel(/end date|fecha.*fin/i)).toBeVisible();
    await expect(page.getByLabel(/rent amount|monto.*alquiler/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /save|guardar/i }),
    ).toBeVisible();
  });

  test("should show validation errors for empty form", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases/new"));

    // Try to submit empty form
    await page.getByRole("button", { name: /save|guardar/i }).click();

    // Should show validation errors
    await expect(
      page.getByText(/required|requerido|obrigatório/i).first(),
    ).toBeVisible();
  });

  test("should create a new lease with valid data", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases/new"));

    // Fill in lease form
    await page.getByLabel(/property|propiedad/i).selectOption({ index: 1 }); // Select first property
    await page.getByLabel(/tenant|inquilino/i).selectOption({ index: 1 }); // Select first tenant
    await page.getByLabel(/start date|fecha.*inicio/i).fill("2024-01-01");
    await page.getByLabel(/end date|fecha.*fin/i).fill("2024-12-31");
    await page.getByLabel(/rent amount|monto.*alquiler/i).fill("1500");
    await page.getByLabel(/deposit|depósito/i).fill("3000");
    await page.getByLabel(/status|estado/i).selectOption("DRAFT");

    // Submit form
    await page.getByRole("button", { name: /save|guardar/i }).click();

    // Should redirect to lease details
    await expect(page).toHaveURL(/\/es\/leases\/[^/]+$/);
  });

  test("should navigate to lease details", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases"));
    await openFirstLease(page);
  });

  test("should display lease details correctly", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases"));
    await openFirstLease(page);

    // Should show lease information sections
    await expect(
      page.getByRole("heading", {
        name: /lease agreement|contrato de alquiler|contrato de aluguel/i,
      }),
    ).toBeVisible();
  });

  test("should display edit and delete buttons on lease detail page", async ({
    page,
  }) => {
    await gotoWithRetry(page, localePath("/leases"));
    await openFirstLease(page);

    // Should show edit/new-version and delete buttons
    await expect(
      page.locator('a[href*="/leases/"][href$="/edit"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /delete|eliminar/i }),
    ).toBeVisible();
  });

  test("should search leases", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases"));

    // Type in search box
    const searchInput = page.getByPlaceholder(/search|buscar/i);
    await searchInput.fill("Test");

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Search input should have the value
    await expect(searchInput).toHaveValue("Test");
  });

  test("should navigate to edit lease page", async ({ page }) => {
    await gotoWithRetry(page, localePath("/leases"));
    await openFirstLease(page);

    const editLink = page.locator('a[href*="/leases/"][href$="/edit"]').first();
    await expect(editLink).toBeVisible();
    const editHref = await editLink.getAttribute("href");
    expect(editHref).toBeTruthy();

    await gotoWithRetry(page, editHref!);

    // Should navigate to edit page
    await expect(page).toHaveURL(/\/es\/leases\/[^/]+\/edit$/);

    // Should show form with existing data
    await expect(
      page.getByRole("button", { name: /save|guardar/i }),
    ).toBeVisible();
  });
});
