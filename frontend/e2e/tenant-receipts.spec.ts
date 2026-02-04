import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Tenant Receipts History', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/tenants'));
    });

    test('should show receipts history on tenant detail', async ({ page }) => {
        await page.waitForSelector('a[href*="/tenants/"]:not([href*="/tenants/new"])', { timeout: 5000 });
        await page.locator('a[href*="/tenants/"]:not([href*="/tenants/new"])').first().click({ force: true });

        await expect(page).toHaveURL(/\/es\/tenants\/[^/]+$/);
        await expect(page.getByText('Historial de recibos')).toBeVisible();
        await expect(page.getByText('REC-202411-0001')).toBeVisible();
    });
});
