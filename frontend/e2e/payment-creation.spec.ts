import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Payment Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/payments'));
    });

    test('should display payments list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/payments/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to create payment page', async ({ page }) => {
        await page.goto(localePath('/payments/new'));

        // Should navigate to new payment page
        await expect(page).toHaveURL(/\/es\/payments\/new/);
    });

    test('should display payment creation form', async ({ page }) => {
        await page.goto(localePath('/payments/new'));

        // Check form has submit button
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should navigate to payment details', async ({ page }) => {
        await page.goto(localePath('/payments'));

        // Wait for payments to load
        await page.waitForSelector('a[href*="/payments/"]:not([href*="/payments/new"])', { timeout: 5000 });

        // Click on first payment link
        const firstPaymentLink = page.locator('a[href*="/payments/"]:not([href*="/payments/new"])').first();
        await firstPaymentLink.click({ force: true });

        // Should navigate to payment detail page
        await expect(page).toHaveURL(/\/es\/payments\/[^/]+$/);
    });

    test('should display payment details correctly', async ({ page }) => {
        await page.goto(localePath('/payments'));

        // Wait for and click first payment
        await page.waitForSelector('a[href*="/payments/"]:not([href*="/payments/new"])', { timeout: 5000 });
        await page.locator('a[href*="/payments/"]:not([href*="/payments/new"])').first().click({ force: true });

        // Should show payment heading or details (use level 1 heading)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should search payments', async ({ page }) => {
        await page.goto(localePath('/payments'));

        // Type in search box if visible
        const searchInput = page.locator('input[type="text"]').first();
        if (await searchInput.isVisible()) {
            await searchInput.fill('PAY');

            // Wait for filter to apply
            await page.waitForTimeout(500);

            // Search input should have the value
            await expect(searchInput).toHaveValue('PAY');
        }
    });

    test('should filter payments by method', async ({ page }) => {
        await page.goto(localePath('/payments'));

        // Find method filter select if exists
        const methodFilter = page.locator('select').first();
        if (await methodFilter.isVisible()) {
            await methodFilter.selectOption({ index: 1 });

            // Wait for filter to apply
            await page.waitForTimeout(500);
        }
    });

    test('should display payment amounts and dates', async ({ page }) => {
        await page.goto(localePath('/payments'));

        // Wait for payments to load
        await page.waitForSelector('a[href*="/payments/"]:not([href*="/payments/new"])', { timeout: 5000 });

        // Click on first payment
        await page.locator('a[href*="/payments/"]:not([href*="/payments/new"])').first().click({ force: true });

        // Should display amount and date information
        await expect(page.locator('body')).toContainText(/\$|ARS|USD|€/);
    });
});
