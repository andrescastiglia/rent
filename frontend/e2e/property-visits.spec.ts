import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Visit Log', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should add a visit and show it in history', async ({ page }) => {
        await page.waitForSelector('a[href*="/properties/"]:not([href*="/properties/new"])', { timeout: 5000 });
        await page.locator('a[href*="/properties/"]:not([href*="/properties/new"])').first().click({ force: true });

        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);

        await page.locator('#visitInterested').fill('Visitante E2E');
        await page.locator('#visitComments').fill('Quiere volver a ver');
        await page.locator('button[type="submit"]').filter({ hasText: /registrar/i }).click();

        await expect(page.getByText('Visitante E2E')).toBeVisible();
        await expect(page.getByText(/quiere volver/i)).toBeVisible();
    });
});
