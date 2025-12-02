import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should display login page', async ({ page }) => {
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('heading', { name: /sistema de gestión de alquileres/i })).toBeVisible();
    });

    test('should navigate to properties after clicking button', async ({ page }) => {
        // Click on "Gestionar Propiedades" link
        await page.getByRole('link', { name: /gestionar propiedades/i }).click();

        // Should navigate to properties page
        await expect(page).toHaveURL('/properties');
        await expect(page.getByRole('heading', { name: /properties/i })).toBeVisible();
    });

    test('should navigate to tenants after clicking button', async ({ page }) => {
        // Click on "Gestionar Inquilinos" link
        await page.getByRole('link', { name: /gestionar inquilinos/i }).click();

        // Should navigate to tenants page
        await expect(page).toHaveURL('/tenants');
        await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    });

    test('should navigate to leases after clicking button', async ({ page }) => {
        // Click on "Gestionar Contratos" link
        await page.getByRole('link', { name: /gestionar contratos/i }).click();

        // Should navigate to leases page
        await expect(page).toHaveURL('/leases');
        await expect(page.getByRole('heading', { name: /leases/i })).toBeVisible();
    });
});

test.describe('Navigation', () => {
    test('should navigate between different sections', async ({ page }) => {
        await page.goto('/');

        // Navigate to properties
        await page.getByRole('link', { name: /gestionar propiedades/i }).click();
        await expect(page).toHaveURL('/properties');

        // Go back to home
        await page.goto('/');

        // Navigate to tenants
        await page.getByRole('link', { name: /gestionar inquilinos/i }).click();
        await expect(page).toHaveURL('/tenants');

        // Go back to home
        await page.goto('/');

        // Navigate to leases
        await page.getByRole('link', { name: /gestionar contratos/i }).click();
        await expect(page).toHaveURL('/leases');
    });
});
