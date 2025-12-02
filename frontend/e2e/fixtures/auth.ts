import { test as base, Page } from '@playwright/test';

// Test user credentials (from seed.ts)
const TEST_USER = {
    email: 'admin@example.com',
    password: 'admin123',
};

// Extend base test with authentication
export const test = base.extend<{ authenticatedPage: Page }>({
    authenticatedPage: async ({ page }, use) => {
        // Go to login page
        await page.goto('/login');

        // Fill in credentials
        await page.getByLabel(/email/i).fill(TEST_USER.email);
        await page.getByLabel(/contraseña/i).fill(TEST_USER.password);

        // Click login button
        await page.getByRole('button', { name: /iniciar sesión/i }).click();

        // Wait for redirect to dashboard
        await page.waitForURL('/dashboard', { timeout: 10000 });

        // Use the authenticated page
        await use(page);
    },
});

export { expect } from '@playwright/test';

// Helper function to login
export async function login(page: Page, email?: string, password?: string) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email || TEST_USER.email);
    await page.getByLabel(/contraseña/i).fill(password || TEST_USER.password);
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await page.waitForURL('/dashboard', { timeout: 10000 });
}
