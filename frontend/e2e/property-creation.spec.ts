import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Property Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/properties'));
    });

    test('should display properties list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/properties/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to create property page', async ({ page }) => {
        // Click "Add Property" button (use link with href pattern)
        await page.locator('a[href*="/properties/new"]').click();

        // Should navigate to new property page
        await expect(page).toHaveURL(/\/es\/properties\/new/);
    });

    test('should display property creation form', async ({ page }) => {
        await page.goto(localePath('/properties/new'));

        // Check form elements are visible using semantic selectors
        await expect(page.locator('input[name="name"]')).toBeVisible();
        await expect(page.locator('input[name="address.street"]')).toBeVisible();
        await expect(page.locator('input[name="address.city"]')).toBeVisible();
        await expect(page.locator('select[name="type"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto(localePath('/properties/new'));

        // Try to submit empty form
        await page.locator('button[type="submit"]').click();

        // Should show validation errors (look for error-styled elements)
        await expect(page.locator('[class*="error"], [class*="invalid"], [aria-invalid="true"]').first()).toBeVisible();
    });

    test('should create a new property with valid data', async ({ page }) => {
        await page.goto(localePath('/properties/new'));

        // Fill in property form using name attributes
        await page.locator('input[name="name"]').fill('Test Property E2E');
        await page.locator('input[name="address.street"]').fill('123 Test Street');
        await page.locator('input[name="address.number"]').fill('100');
        await page.locator('input[name="address.city"]').fill('Test City');
        await page.locator('input[name="address.state"]').fill('Test State');
        await page.locator('input[name="address.zipCode"]').fill('12345');
        await page.locator('input[name="address.country"]').fill('Test Country');
        await page.locator('select[name="type"]').selectOption('APARTMENT');

        // Submit form
        await page.locator('button[type="submit"]').click();

        // Should redirect to property details
        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);

        // Should show the property name
        await expect(page.getByText(/test property e2e/i)).toBeVisible();
    });

    test('should navigate to property details', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Wait for properties to load (links with locale prefix)
        await page.waitForSelector('a[href*="/properties/"]:not([href*="/properties/new"])', { timeout: 5000 });

        // Click on first property card link
        const firstPropertyLink = page.locator('a[href*="/properties/"]:not([href*="/properties/new"])').first();
        await firstPropertyLink.click({ force: true });

        // Should navigate to property detail page
        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);
    });

    test('should display edit button on property detail page', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Wait for and click first property
        await page.waitForSelector('a[href*="/properties/"]:not([href*="/properties/new"])', { timeout: 5000 });
        await page.locator('a[href*="/properties/"]:not([href*="/properties/new"])').first().click({ force: true });

        // Should show edit link
        await expect(page.locator('a[href*="/edit"]')).toBeVisible();
    });

    test('should search properties', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Type in search box
        const searchInput = page.locator('input[type="search"], input[placeholder*="earch"]');
        await searchInput.fill('Test');

        // Results should filter (this assumes client-side filtering is instant)
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });
});
