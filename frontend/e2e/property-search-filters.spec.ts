import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Search Filters', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should filter owners by search term', async ({ page }) => {
        await page.getByPlaceholder(/propietario|owner/i).fill('Carlos');

        await expect(page.getByRole('button', { name: /carlos/i }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /ana/i })).toHaveCount(0);
    });
});
