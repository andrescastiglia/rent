import { test, expect } from '@playwright/test';
import { login, localePath, TEST_USER } from './fixtures/auth';

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(localePath('/login'));
    });

    test('should display login page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/login/);
        // Use language-agnostic selectors (email field, password field, submit button)
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.locator('input[type="email"]').fill('invalid@example.com');
        await page.locator('input[type="password"]').fill('wrongpassword');
        await page.locator('button[type="submit"]').click();

        // Should show error message (may be in any language)
        await expect(page.getByRole('alert').or(page.locator('[class*="error"]'))).toBeVisible({ timeout: 10000 });
    });

    test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
        await page.locator('input[type="email"]').fill(TEST_USER.email);
        await page.locator('input[type="password"]').fill(TEST_USER.password);
        await page.locator('button[type="submit"]').click();

        // Should redirect to dashboard with locale prefix
        await expect(page).toHaveURL(/\/es\/dashboard/, { timeout: 10000 });
    });

    test('should redirect from root to login when not authenticated', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/es\/login/);
    });
});

test.describe('Navigation after login', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Wait a bit for state to stabilize after login
        await page.waitForTimeout(500);
    });

    test('should navigate to properties page', async ({ page }) => {
        await page.goto(localePath('/properties'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/properties/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to tenants page', async ({ page }) => {
        await page.goto(localePath('/tenants'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/tenants/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to leases page', async ({ page }) => {
        await page.goto(localePath('/leases'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/leases/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate between different sections', async ({ page }) => {
        // Navigate to properties
        await page.goto(localePath('/properties'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/properties/);

        // Navigate to tenants
        await page.goto(localePath('/tenants'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/tenants/);

        // Navigate to leases
        await page.goto(localePath('/leases'), { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/es\/leases/);
    });
});
