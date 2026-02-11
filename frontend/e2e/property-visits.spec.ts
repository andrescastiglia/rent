import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Maintenance Log', () => {
    const propertyDetailLinkSelector =
        'a[href*="/properties/"]:not([href*="/properties/new"]):not([href*="/edit"]):not([href*="#"])';

    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should add a maintenance task and show it in history', async ({ page }) => {
        await page.waitForSelector(propertyDetailLinkSelector, { timeout: 10000 });
        await page.locator(propertyDetailLinkSelector).first().click({ force: true });

        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);

        await page.locator('#maintenanceTitle').fill('Mantenimiento E2E');
        await page.locator('#maintenanceNotes').fill('Cambiar luminarias del pasillo');
        await page.locator('button[type="submit"]').filter({ hasText: /registrar/i }).click();

        await expect(page.getByText('Mantenimiento E2E')).toBeVisible();
        await expect(page.getByText(/cambiar luminarias/i)).toBeVisible();
    });
});
