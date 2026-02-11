import { test as base, Page } from '@playwright/test';

// E2E tests always use mock mode by default (NEXT_PUBLIC_MOCK_MODE=true in package.json scripts)
// Use npm run test:e2e:real to test with real backend
const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || process.env.CI === 'true';

// Test user credentials - mock credentials by default, real backend credentials when USE_MOCK is false
export const TEST_USER = USE_MOCK ? {
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
        await login(page);

        // Use the authenticated page
        await use(page);
    },
});

export { expect } from '@playwright/test';

// Helper function to login
export async function login(page: Page, email?: string, password?: string) {
    const targetEmail = email || TEST_USER.email;
    const targetPassword = password || TEST_USER.password;
    const attempts = 2;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await page.goto(`/${DEFAULT_LOCALE}/login`);
        await page.getByLabel(/email/i).fill(targetEmail);
        await page.getByLabel(/password|contraseña|senha/i).fill(targetPassword);
        await page.getByRole('button', { name: /login|iniciar sesión|entrar/i }).click();

        try {
            await page.waitForURL(`**/${DEFAULT_LOCALE}/dashboard`, { timeout: 10000 });
            return;
        } catch (error) {
            if (attempt === attempts) throw error;
            await page.waitForTimeout(500);
        }
    }
}

// Helper to navigate to a page with locale prefix
export function localePath(path: string): string {
    return `/${DEFAULT_LOCALE}${path.startsWith('/') ? path : '/' + path}`;
}
