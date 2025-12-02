import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('should display login page', async ({ page }) => {
        await expect(page).toHaveURL('/login');
        await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible();
        await expect(page.getByText(/sistema de gestión de alquileres/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.getByLabel(/email/i).fill('invalid@example.com');
        await page.getByLabel(/contraseña/i).fill('wrongpassword');
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Should show error message (in Spanish: "Credenciales inválidas")
        await expect(page.getByText(/credenciales inválidas|error/i)).toBeVisible({ timeout: 10000 });
    });

    test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
        await page.getByLabel(/email/i).fill('admin@example.com');
        await page.getByLabel(/contraseña/i).fill('admin123');
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Should redirect to dashboard
        await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
    });

    test('should redirect from root to login when not authenticated', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL('/login');
    });
});

test.describe('Navigation after login', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Wait a bit for state to stabilize after login
        await page.waitForTimeout(500);
    });

    test('should navigate to properties page', async ({ page }) => {
        await page.goto('/properties', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/properties');
        await expect(page.getByRole('heading', { name: /properties/i })).toBeVisible();
    });

    test('should navigate to tenants page', async ({ page }) => {
        await page.goto('/tenants', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/tenants');
        await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible();
    });

    test('should navigate to leases page', async ({ page }) => {
        await page.goto('/leases', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/leases');
        await expect(page.getByRole('heading', { name: /leases/i })).toBeVisible();
    });

    test('should navigate between different sections', async ({ page }) => {
        // Navigate to properties
        await page.goto('/properties', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/properties');

        // Navigate to tenants
        await page.goto('/tenants', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/tenants');

        // Navigate to leases
        await page.goto('/leases', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL('/leases');
    });
});
