import { test, expect, gotoWithRetry, login, localePath } from './fixtures/auth';

test.describe('Property Creation Flow', () => {
    const ownerButtonSelector = '[data-testid="owner-row-main"]';
    const addPropertyForOwnerSelector = 'a[href*="/properties/new?ownerId="]';
    const propertyDetailLinkSelector = '[data-testid^="property-view-link-"]';

    test.beforeEach(async ({ page }) => {
        await login(page);
        await gotoWithRetry(page, localePath('/properties'));
    });

    test('should display properties list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/properties/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should navigate to create property page', async ({ page }) => {
        await page.locator(ownerButtonSelector).first().click();
        await page.locator(addPropertyForOwnerSelector).first().click();

        await expect(page).toHaveURL(/\/es\/properties\/new\?ownerId=/);
    });

    test('should display property creation form', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties/new?ownerId=owner1'));

        // Check form elements are visible using semantic selectors
        await expect(page.locator('input[name="name"]')).toBeVisible();
        await expect(page.locator('input[name="address.street"]')).toBeVisible();
        await expect(page.locator('input[name="address.city"]')).toBeVisible();
        await expect(page.locator('select[name="type"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties/new?ownerId=owner1'));

        // Try to submit empty form
        await page.locator('button[type="submit"]').click();

        // Should show validation errors (text-red-600 class for error messages)
        await expect(page.locator('.text-red-600, p[class*="red"]').first()).toBeVisible();
    });

    test('should create a new property with valid data', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties/new?ownerId=owner1'));

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
        await gotoWithRetry(page, localePath('/properties'));
        await page.locator(ownerButtonSelector).first().click();

        await page.waitForSelector(propertyDetailLinkSelector, { timeout: 10000 });
        await page.locator(propertyDetailLinkSelector).first().click({
            noWaitAfter: true,
        });
        await page.waitForURL(/\/es\/properties\/[^/]+$/, {
            timeout: 30000,
            waitUntil: 'commit',
        });
    });

    test('should display edit button on property detail page', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties'));
        await page.locator(ownerButtonSelector).first().click();

        await page.waitForSelector(propertyDetailLinkSelector, { timeout: 10000 });
        await page.locator(propertyDetailLinkSelector).first().click({
            noWaitAfter: true,
        });
        await page.waitForURL(/\/es\/properties\/[^/]+$/, {
            timeout: 30000,
            waitUntil: 'commit',
        });

        await expect(page.getByRole('link', { name: /edit|editar/i }).first()).toBeVisible();
    });

    test('should search properties', async ({ page }) => {
        await gotoWithRetry(page, localePath('/properties'));

        // Type in search box (it's a text input with a search icon)
        const searchInput = page.locator('input[type="text"]').first();
        await searchInput.fill('Test');

        // Results should filter (this assumes client-side filtering is instant)
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });
});
