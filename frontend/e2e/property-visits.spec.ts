import { test, expect, gotoWithRetry, login, localePath } from './fixtures/auth';

test.describe('Property Maintenance Log', () => {
    const ownerButtonSelector = '[data-testid="owner-row-main"]';
    const propertyDetailLinkSelector = '[data-testid^="property-view-link-"]';

    test.beforeEach(async ({ page }) => {
        await login(page);
        await gotoWithRetry(page, localePath('/properties'));
    });

    test('should add a maintenance task and show it in history', async ({ page }) => {
        const ownerButton = page.locator(ownerButtonSelector).first();
        await expect(ownerButton).toBeVisible({ timeout: 15000 });
        await ownerButton.click();

        const propertyDetailLink = page.locator(propertyDetailLinkSelector).first();
        await expect(propertyDetailLink).toBeVisible({ timeout: 30000 });
        await Promise.all([
            page.waitForURL(/\/es\/properties\/[^/]+$/, {
                timeout: 30000,
                waitUntil: 'commit',
            }),
            propertyDetailLink.click(),
        ]);

        const maintenanceLink = page.locator('a[href*="/maintenance/new"]').first();
        await expect(maintenanceLink).toBeVisible({ timeout: 15000 });
        await Promise.all([
            page.waitForURL(/\/es\/properties\/[^/]+\/maintenance\/new$/, {
                timeout: 30000,
                waitUntil: 'commit',
            }),
            maintenanceLink.click(),
        ]);

        const titleInput = page.locator('#maintenanceTitle');
        await expect(titleInput).toBeVisible({ timeout: 15000 });
        await titleInput.fill('Mantenimiento E2E');
        await page.locator('#maintenanceNotes').fill('Cambiar luminarias del pasillo');

        const submitButton = page.locator('button[type="submit"]');
        await expect(submitButton).toBeEnabled({ timeout: 15000 });
        await Promise.all([
            page.waitForURL(/\/es\/properties\/[^/]+$/, {
                timeout: 30000,
                waitUntil: 'commit',
            }),
            submitButton.click(),
        ]);

        await expect(page.getByText('Mantenimiento E2E')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/cambiar luminarias/i)).toBeVisible({ timeout: 15000 });
    });
});
