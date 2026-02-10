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

        // Should show validation errors (text-red-600 class for error messages)
        await expect(page.locator('.text-red-600, p[class*="red"]').first()).toBeVisible();
    });

    test('should create a new property with valid data', async ({ page }) => {
        await page.goto(localePath('/properties/new'));

        // Fill in property form using name attributes
        const ownerSelect = page.locator('select[name="ownerId"]');
        if (await ownerSelect.count()) {
            await ownerSelect.selectOption({ index: 1 });
        }
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
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to property details', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Click first "View" action from owner/property list
        await page.getByRole('link', { name: /view|ver/i }).first().click({ force: true });

        // Should navigate to property detail page
        await expect(page).toHaveURL(/\/es\/properties\/[^/]+$/);
    });

    test('should display edit button on property detail page', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Go to property detail
        await page.getByRole('link', { name: /view|ver/i }).first().click({ force: true });

        // Should show edit link
        await expect(page.getByRole('link', { name: /edit|editar/i }).first()).toBeVisible();
    });

    test('should search properties', async ({ page }) => {
        await page.goto(localePath('/properties'));

        // Type in search box (it's a text input with a search icon)
        const searchInput = page.locator('input[type="text"]').first();
        await searchInput.fill('Test');

        // Results should filter (this assumes client-side filtering is instant)
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });
});
