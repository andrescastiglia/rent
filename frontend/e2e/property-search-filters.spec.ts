import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Search Filters', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should filter properties by investment range', async ({ page }) => {
        await page.locator('#minInvestment').fill('100000');
        await page.locator('#maxInvestment').fill('160000');
        await page.getByRole('button', { name: /aplicar/i }).click();

        await expect(page.getByText('Edificio Central')).toBeVisible();
        await expect(page.getByText('Casa Los Pinos')).toHaveCount(0);
    });
});
