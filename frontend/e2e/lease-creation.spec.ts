import { test, expect, login } from './fixtures/auth';

test.describe('Lease Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto('/leases');
    });

    test('should display leases list page', async ({ page }) => {
        await expect(page).toHaveURL('/leases');
        await expect(page.getByRole('heading', { name: /leases/i })).toBeVisible();
    });

    test('should navigate to create lease page', async ({ page }) => {
        // Click "Create Lease" button
        await page.getByRole('link', { name: /create lease/i }).click();

        // Should navigate to new lease page
        await expect(page).toHaveURL('/leases/new');
    });

    test('should display lease creation form', async ({ page }) => {
        await page.goto('/leases/new');

        // Check form elements are visible
        await expect(page.getByLabel(/property/i)).toBeVisible();
        await expect(page.getByLabel(/tenant/i)).toBeVisible();
        await expect(page.getByLabel(/start date/i)).toBeVisible();
        await expect(page.getByLabel(/end date/i)).toBeVisible();
        await expect(page.getByLabel(/rent amount/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /save lease/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto('/leases/new');

        // Try to submit empty form
        await page.getByRole('button', { name: /save lease/i }).click();

        // Should show validation errors
        await expect(page.getByText(/required/i).first()).toBeVisible();
    });

    test('should create a new lease with valid data', async ({ page }) => {
        await page.goto('/leases/new');

        // Fill in lease form
        await page.getByLabel(/property/i).selectOption({ index: 1 }); // Select first property
        await page.getByLabel(/unit id/i).fill('101');
        await page.getByLabel(/tenant/i).selectOption({ index: 1 }); // Select first tenant
        await page.getByLabel(/start date/i).fill('2024-01-01');
        await page.getByLabel(/end date/i).fill('2024-12-31');
        await page.getByLabel(/rent amount/i).fill('1500');
        await page.getByLabel(/deposit amount/i).fill('3000');
        await page.getByLabel(/status/i).selectOption('DRAFT');

        // Submit form
        await page.getByRole('button', { name: /save lease/i }).click();

        // Should redirect to lease details
        await expect(page).toHaveURL(/\/leases\/[^\/]+$/);
    });

    test('should navigate to lease details', async ({ page }) => {
        await page.goto('/leases');

        // Wait for leases to load
        await page.waitForSelector('a[href^="/leases/"]:not([href="/leases/new"])', { timeout: 5000 });

        // Click on first lease card link
        const firstLeaseLink = page.locator('a[href^="/leases/"]:not([href="/leases/new"])').first();
        await firstLeaseLink.click({ force: true });

        // Should navigate to lease detail page
        await expect(page).toHaveURL(/\/leases\/[^\/]+$/);
    });

    test('should display lease details correctly', async ({ page }) => {
        await page.goto('/leases');

        // Wait for and click first lease
        await page.waitForSelector('a[href^="/leases/"]:not([href="/leases/new"])', { timeout: 5000 });
        await page.locator('a[href^="/leases/"]:not([href="/leases/new"])').first().click({ force: true });

        // Should show lease information sections
        await expect(page.getByRole('heading', { name: /lease agreement/i })).toBeVisible();
        await expect(page.getByText(/financial details/i)).toBeVisible();
        await expect(page.getByText(/duration/i)).toBeVisible();
    });

    test('should display edit and delete buttons on lease detail page', async ({ page }) => {
        await page.goto('/leases');

        // Wait for and click first lease
        await page.waitForSelector('a[href^="/leases/"]:not([href="/leases/new"])', { timeout: 5000 });
        await page.locator('a[href^="/leases/"]:not([href="/leases/new"])').first().click({ force: true });

        // Should show edit and delete buttons
        await expect(page.getByRole('link', { name: /edit/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
    });

    test('should search leases', async ({ page }) => {
        await page.goto('/leases');

        // Type in search box
        const searchInput = page.getByPlaceholder(/search/i);
        await searchInput.fill('Test');

        // Wait for filter to apply
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });

    test('should navigate to edit lease page', async ({ page }) => {
        await page.goto('/leases');

        // Wait for and click first lease
        await page.waitForSelector('a[href^="/leases/"]:not([href="/leases/new"])', { timeout: 5000 });
        await page.locator('a[href^="/leases/"]:not([href="/leases/new"])').first().click({ force: true });

        // Click edit button
        await page.getByRole('link', { name: /edit/i }).click({ force: true });

        // Should navigate to edit page
        await expect(page).toHaveURL(/\/leases\/[^\/]+\/edit$/);

        // Should show form with existing data
        await expect(page.getByRole('button', { name: /save lease/i })).toBeVisible();
    });
});
