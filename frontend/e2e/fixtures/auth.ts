import { test as base, Page } from '@playwright/test';

// Use mock mode by default unless explicitly disabled.
const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_MODE !== 'false';

type Credentials = {
    email: string;
    password: string;
};

const MOCK_TEST_USER: Credentials = {
    email: 'admin@example.com',
    password: 'admin123',
};

const REAL_TEST_USER: Credentials = {
    email: 'test@test.com',
    password: 'Test123!',
};

// Test user credentials - mock credentials by default, real backend credentials when USE_MOCK is false
export const TEST_USER = USE_MOCK ? MOCK_TEST_USER : REAL_TEST_USER;

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

const LOGIN_INVALID_CREDENTIALS_PATTERN =
    /credenciales inválidas|invalid credentials|credenciais inválidas/i;
const LOGIN_NETWORK_ERROR_PATTERN = /failed to fetch/i;
const LOGIN_GENERIC_ERROR_PATTERN = /error al iniciar sesión|erro ao entrar|login error|error signing in/i;

const MOCK_AUTH_USER = {
    id: '1',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    phone: '+1 555 0101',
    avatarUrl: null,
    language: 'es',
    name: 'Admin User',
    role: 'admin',
    isActive: true,
};

function uniqueCredentials(items: Credentials[]): Credentials[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = `${item.email}::${item.password}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function resolveCredentialCandidates(email?: string, password?: string): Credentials[] {
    if (email && password) {
        return [{ email, password }];
    }

    const envEmail = process.env.E2E_EMAIL;
    const envPassword = process.env.E2E_PASSWORD;

    const candidates: Credentials[] = [];
    if (USE_MOCK) {
        candidates.push(MOCK_TEST_USER);
    } else {
        if (envEmail && envPassword) {
            candidates.push({ email: envEmail, password: envPassword });
        }
        candidates.push(REAL_TEST_USER, MOCK_TEST_USER);
    }

    return uniqueCredentials(candidates);
}

// Helper function to login
export async function login(page: Page, email?: string, password?: string) {
    // In mock mode, prefer seeding auth storage directly to avoid flaky UI login under parallel runs.
    if (USE_MOCK && !email && !password) {
        const token = `mock-token-${MOCK_AUTH_USER.id}-${Date.now()}`;
        await page.goto(`/${DEFAULT_LOCALE}/login`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(
            ({ authToken, authUser }) => {
                localStorage.setItem('auth_token', authToken);
                localStorage.setItem('auth_user', JSON.stringify(authUser));
            },
            { authToken: token, authUser: MOCK_AUTH_USER },
        );
        await page.goto(`/${DEFAULT_LOCALE}/dashboard`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`**/${DEFAULT_LOCALE}/dashboard`, { timeout: 10000 });
        return;
    }

    const credentialCandidates = resolveCredentialCandidates(email, password);
    const attemptsPerCredential = 2;
    let lastError = `could not reach /${DEFAULT_LOCALE}/dashboard`;

    for (const candidate of credentialCandidates) {
        for (let attempt = 1; attempt <= attemptsPerCredential; attempt += 1) {
            await page.goto(`/${DEFAULT_LOCALE}/login`, { waitUntil: 'domcontentloaded' });

            const emailInput = page.locator('input#email, input[type="email"]').first();
            const passwordInput = page.locator('input#password, input[type="password"]').first();

            await emailInput.waitFor({ state: 'visible', timeout: 10000 });
            await passwordInput.waitFor({ state: 'visible', timeout: 10000 });

            await emailInput.fill(candidate.email);
            await passwordInput.fill(candidate.password);

            const submitButton = page.locator('button[type="submit"]').first();
            await submitButton.click();

            try {
                await page.waitForURL(`**/${DEFAULT_LOCALE}/dashboard`, { timeout: 10000 });
                return;
            } catch {
                const pageText = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase();

                if (LOGIN_NETWORK_ERROR_PATTERN.test(pageText)) {
                    throw new Error(
                        'E2E login failed: Failed to fetch (backend unavailable or mock mode disabled).',
                    );
                }

                if (LOGIN_INVALID_CREDENTIALS_PATTERN.test(pageText)) {
                    lastError = `invalid credentials for ${candidate.email}`;
                    break;
                }

                if (LOGIN_GENERIC_ERROR_PATTERN.test(pageText)) {
                    lastError = 'login rejected by API';
                } else {
                    lastError = `could not reach /${DEFAULT_LOCALE}/dashboard`;
                }
            }

            if (attempt < attemptsPerCredential) {
                await page.waitForTimeout(500);
            }
        }
    }

    throw new Error(
        `E2E login failed after trying ${credentialCandidates.length} credential set(s). Last error: ${lastError}`,
    );
}

// Helper to navigate to a page with locale prefix
export function localePath(path: string): string {
    return `/${DEFAULT_LOCALE}${path.startsWith('/') ? path : '/' + path}`;
}
