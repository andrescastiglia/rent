import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Maintenance Log', () => {
    const ownerButtonSelector = '[data-testid="owner-row-main"]';
    const propertyDetailLinkSelector = '[data-testid^="property-view-link-"]';

    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should add a maintenance task and show it in history', async ({ page }) => {
        await page.locator(ownerButtonSelector).first().click();
        await page.waitForSelector(propertyDetailLinkSelector, { timeout: 10000 });
        await page.locator(propertyDetailLinkSelector).first().click({
            noWaitAfter: true,
        });
        await page.waitForURL(/\/es\/properties\/[^/]+$/, {
            timeout: 30000,
            waitUntil: 'commit',
        });

        await page.locator('a[href*="/maintenance/new"]').first().click();
        await expect(page).toHaveURL(/\/es\/properties\/[^/]+\/maintenance\/new$/);

        await page.locator('#maintenanceTitle').fill('Mantenimiento E2E');
        await page.locator('#maintenanceNotes').fill('Cambiar luminarias del pasillo');
        await page.locator('button[type="submit"]').click();

        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);

        await expect(page.getByText('Mantenimiento E2E')).toBeVisible();
        await expect(page.getByText(/cambiar luminarias/i)).toBeVisible();
    });
});
