import { test, expect, gotoWithRetry, login, localePath } from './fixtures/auth';

test.describe('Tenant Receipts History', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await gotoWithRetry(page, localePath('/tenants'));
    });

    test('should show payments history on tenant detail', async ({ page }) => {
        const firstTenantDetailLink = page.getByTestId('tenant-detail-link').first();
        await expect(firstTenantDetailLink).toBeVisible({ timeout: 5000 });
        await firstTenantDetailLink.click({ force: true });

        await expect(page).toHaveURL(/\/es\/tenants\/[^/]+$/);
        const paymentsSection = page.locator('section').filter({
            has: page.getByRole('heading', { name: /^pagos$/i }),
        });
        await expect(paymentsSection).toBeVisible();
        await expect(paymentsSection.getByText('REC-202411-0001').first()).toBeVisible();
        await expect(page.getByText('Historial de recibos')).toHaveCount(0);
    });
});
