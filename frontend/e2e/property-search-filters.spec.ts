import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Search Filters', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should filter properties by search term', async ({ page }) => {
        await page.getByPlaceholder(/propietario|owner|propiedad|property/i).fill('Edificio Central');

        await expect(page.getByText('Edificio Central')).toBeVisible();
        await expect(page.getByText('Casa Los Pinos')).toHaveCount(0);
    });
});
