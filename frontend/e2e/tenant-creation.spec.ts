import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Tenant Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/tenants'));
    });

    test('should display tenants list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/tenants/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should not show create tenant shortcut in list', async ({ page }) => {
        await expect(page.locator('a[href*="/tenants/new"]')).toHaveCount(0);
    });

    test('should display tenant creation form', async ({ page }) => {
        await page.goto(localePath('/tenants/new'));

        // Check form elements are visible using name attributes
        await expect(page.locator('input[name="firstName"]')).toBeVisible();
        await expect(page.locator('input[name="lastName"]')).toBeVisible();
        await expect(page.locator('input[name="email"]')).toBeVisible();
        await expect(page.locator('input[name="phone"]')).toBeVisible();
        await expect(page.locator('input[name="dni"]')).toBeVisible();
        await expect(page.locator('select[name="status"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto(localePath('/tenants/new'));

        // Try to submit empty form
        await page.locator('button[type="submit"]').click();

        // Should show validation errors (text-red-600 class for error messages)
        await expect(page.locator('.text-red-600, p[class*="red"]').first()).toBeVisible();
    });

    test('should create a new tenant with valid data', async ({ page }) => {
        await page.goto(localePath('/tenants/new'));

        // Fill in tenant form using name attributes
        await page.locator('input[name="firstName"]').fill('John');
        await page.locator('input[name="lastName"]').fill('Doe E2E');
        await page.locator('input[name="email"]').fill(`john.doe.e2e.${Date.now()}@example.com`);
        await page.locator('input[name="phone"]').fill('+5491155554444');
        await page.locator('input[name="dni"]').fill('12345678');
        await page.locator('select[name="status"]').selectOption('PROSPECT');

        // Optionally fill address
        await page.locator('input[name="address.street"]').fill('123 Test Street');
        await page.locator('input[name="address.city"]').fill('Buenos Aires');

        // Submit form
        await page.locator('button[type="submit"]').click();

        // Should redirect to tenants list or tenant details
        await expect(page).toHaveURL(/\/es\/tenants(\/[^/]+)?$/);
    });

    test('should navigate to tenant details', async ({ page }) => {
        await page.goto(localePath('/tenants'));

        // Wait for tenants to load (links with locale prefix)
        await page.waitForSelector('a[href*="/tenants/"]:not([href*="/tenants/new"])', { timeout: 5000 });

        // Click on first tenant card link
        const firstTenantLink = page.locator('a[href*="/tenants/"]:not([href*="/tenants/new"])').first();
        await firstTenantLink.click({ force: true });

        // Should navigate to tenant detail page
        await expect(page).toHaveURL(/\/es\/tenants\/[^/]+$/);
    });

    test('should display edit button on tenant detail page', async ({ page }) => {
        await page.goto(localePath('/tenants'));

        // Wait for and click first tenant
        await page.waitForSelector('a[href*="/tenants/"]:not([href*="/tenants/new"])', { timeout: 5000 });
        await page.locator('a[href*="/tenants/"]:not([href*="/tenants/new"])').first().click({ force: true });

        // Should show edit link
        await expect(page.locator('a[href*="/tenants/"][href*="/edit"]').first()).toBeVisible();
    });

    test('should search tenants', async ({ page }) => {
        await page.goto(localePath('/tenants'));

        // Type in search box (it's a text input)
        const searchInput = page.locator('input[type="text"]').first();
        await searchInput.fill('John');

        // Wait for filter to apply
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('John');
    });

    test('should navigate to edit tenant page', async ({ page }) => {
        await page.goto(localePath('/tenants'));

        // Wait for and click first tenant
        await page.waitForSelector('a[href*="/tenants/"]:not([href*="/tenants/new"])', { timeout: 5000 });
        await page.locator('a[href*="/tenants/"]:not([href*="/tenants/new"])').first().click({ force: true });

        // Click edit button
        await page.locator('a[href*="/tenants/"][href*="/edit"]').first().click({ force: true });

        // Should navigate to edit page
        await expect(page).toHaveURL(/\/es\/tenants\/[^/]+\/edit$/);

        // Should show form with existing data
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });
});
