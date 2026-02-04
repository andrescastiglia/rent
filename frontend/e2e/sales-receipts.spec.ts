import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Sales Receipts Duplicate', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/sales'));
    });

    test('should show duplicate requirement and receipt download', async ({ page }) => {
        await expect(page.getByText('Impresión duplicada obligatoria')).toBeVisible();
        await expect(page.getByText('Descargar recibo PDF')).toBeVisible();
    });
});
