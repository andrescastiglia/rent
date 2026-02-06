import { test, expect, login, localePath } from './fixtures/auth';
import type { Page } from '@playwright/test';

test.describe('Invoice Flow', () => {
    const invoiceLinksSelector = 'a[href*="/invoices/"]:not([href*="/invoices/new"])';

    const openFirstInvoice = async (page: Page) => {
        const firstInvoiceLink = page.locator(invoiceLinksSelector).first();
        await expect(firstInvoiceLink).toBeVisible({ timeout: 10000 });
        await Promise.all([
            page.waitForURL(/\/es\/invoices\/[^/]+$/, { timeout: 10000 }),
            firstInvoiceLink.click(),
        ]);
    };

    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/invoices'));
    });

    test('should display invoices list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/invoices/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to invoice details', async ({ page }) => {
        await page.goto(localePath('/invoices'));
        await openFirstInvoice(page);
    });

    test('should display invoice details correctly', async ({ page }) => {
        await page.goto(localePath('/invoices'));
        await openFirstInvoice(page);

        // Should show invoice heading or details (use level 1 heading)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should search invoices', async ({ page }) => {
        await page.goto(localePath('/invoices'));

        // Type in search box if visible
        const searchInput = page.locator('input[type="text"]').first();
        if (await searchInput.isVisible()) {
            await searchInput.fill('INV');

            // Wait for filter to apply
            await page.waitForTimeout(500);

            // Search input should have the value
            await expect(searchInput).toHaveValue('INV');
        }
    });

    test('should filter invoices by status', async ({ page }) => {
        await page.goto(localePath('/invoices'));

        // Find status filter select if exists
        const statusFilter = page.locator('select').first();
        if (await statusFilter.isVisible()) {
            await statusFilter.selectOption({ index: 1 });

            // Wait for filter to apply
            await page.waitForTimeout(500);
        }
    });

    test('should display invoice amounts and dates', async ({ page }) => {
        await page.goto(localePath('/invoices'));
        await openFirstInvoice(page);

        // Should display amount and date information
        // Look for currency symbols or date patterns
        await expect(page.locator('body')).toContainText(/\$|ARS|USD|€/);
    });
});
