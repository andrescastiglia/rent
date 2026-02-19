import { test, expect } from '@playwright/test';
import { login, localePath, TEST_USER } from './fixtures/auth';

async function gotoWithRetry(page: import('@playwright/test').Page, path: string): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await page.goto(path, { waitUntil: 'domcontentloaded' });
            return;
        } catch (error) {
            const retriable = /ERR_ABORTED|frame was detached/i.test(String(error));
            if (!retriable || attempt === maxAttempts || page.isClosed()) {
                throw error;
            }
            await page.waitForTimeout(300);
        }
    }
}

test.describe('Login Flow', () => {
    test.beforeEach(async ({ page }) => {
        await gotoWithRetry(page, localePath('/login'));
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
        await gotoWithRetry(page, '/');
        await expect(page).toHaveURL(/\/es\/login/);
    });
});

test.describe('Navigation after login', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        // Ensure auth state is fully persisted before navigating.
        await expect
            .poll(async () => page.evaluate(() => localStorage.getItem('auth_token')))
            .not.toBeNull();
    });

    test('should navigate to properties page', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties'));
        await expect(page).toHaveURL(/\/es\/properties/, { timeout: 10000 });
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('should navigate to tenants page', async ({ page }) => {
        await gotoWithRetry(page, localePath('/tenants'));
        await expect(page).toHaveURL(/\/es\/tenants/, { timeout: 10000 });
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('should navigate to leases page', async ({ page }) => {
        await gotoWithRetry(page, localePath('/leases'));
        await expect(page).toHaveURL(/\/es\/leases/, { timeout: 10000 });
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    });

    test('should navigate between different sections', async ({ page }) => {
        // Navigate to properties
        await gotoWithRetry(page, localePath('/properties'));
        await expect(page).toHaveURL(/\/es\/properties/, { timeout: 10000 });

        // Navigate to tenants
        await gotoWithRetry(page, localePath('/tenants'));
        await expect(page).toHaveURL(/\/es\/tenants/, { timeout: 10000 });

        // Navigate to leases
        await gotoWithRetry(page, localePath('/leases'));
        await expect(page).toHaveURL(/\/es\/leases/, { timeout: 10000 });
    });
});
