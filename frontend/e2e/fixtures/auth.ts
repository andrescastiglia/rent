import { test as base, Page } from '@playwright/test';

// In CI we use mock mode (no backend), locally we use real backend
const IS_CI = process.env.CI === 'true';

// Test user credentials - mock credentials for CI, real backend credentials for local
export const TEST_USER = IS_CI ? {
    email: 'admin@example.com',
    password: 'admin123',
} : {
    email: 'test@test.com',
    password: 'Test123!',
};

// Default locale for tests
const DEFAULT_LOCALE = 'es';

// Extend base test with authentication
export const test = base.extend<{ authenticatedPage: Page }>({
    authenticatedPage: async ({ page }, use) => {
        // Go to login page with locale
        await page.goto(`/${DEFAULT_LOCALE}/login`);

        // Fill in credentials (labels may vary by locale)
        await page.getByLabel(/email/i).fill(TEST_USER.email);
        await page.getByLabel(/password|contraseña|senha/i).fill(TEST_USER.password);

        // Click login button
        await page.getByRole('button', { name: /login|iniciar sesión|entrar/i }).click();

        // Wait for redirect to dashboard (with locale prefix)
        await page.waitForURL(`**/${DEFAULT_LOCALE}/dashboard`, { timeout: 10000 });

        // Use the authenticated page
        await use(page);
    },
});

export { expect } from '@playwright/test';

// Helper function to login
export async function login(page: Page, email?: string, password?: string) {
    await page.goto(`/${DEFAULT_LOCALE}/login`);
    await page.getByLabel(/email/i).fill(email || TEST_USER.email);
    await page.getByLabel(/password|contraseña|senha/i).fill(password || TEST_USER.password);
    await page.getByRole('button', { name: /login|iniciar sesión|entrar/i }).click();
    await page.waitForURL(`**/${DEFAULT_LOCALE}/dashboard`, { timeout: 10000 });
}

// Helper to navigate to a page with locale prefix
export function localePath(path: string): string {
    return `/${DEFAULT_LOCALE}${path.startsWith('/') ? path : '/' + path}`;
}
