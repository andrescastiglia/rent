import { defineConfig, devices } from '@playwright/test';

// Check if we're using mock mode (set by test:e2e script or CI)
const useMockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || process.env.CI === 'true';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI 
        ? [
            ['list'], 
            ['@bdellegrazie/playwright-sonar-reporter', {
                outputFile: 'playwright-report/playwright-sonar-report.xml', 
                sonarcloud: true,
            }],
          ]
        : [['html', { open: 'never' }]],
    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    expect: {
        timeout: 10000,
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Always run headless
                headless: true,
            },
        },
    ],

    webServer: {
        // In mock mode or CI, use dev server (mocks work with dev server)
        // When testing with real backend (test:e2e:real), also use dev server
        command: 'npm run dev -- -H 127.0.0.1 -p 3000',
        url: 'http://localhost:3000',
        // In mock-mode, always start a fresh server so env flags are applied deterministically.
        // (If we reuse a manually-started dev server, it may not have NEXT_PUBLIC_MOCK_MODE enabled.)
        reuseExistingServer: !process.env.CI && !useMockMode,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe',
        // Pass environment variables to the web server
        env: {
            NEXT_PUBLIC_MOCK_MODE: useMockMode ? 'true' : 'false',
        },
    },
});
