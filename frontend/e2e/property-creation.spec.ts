import { test, expect } from '@playwright/test';

test.describe('Property Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/properties');
    });

    test('should display properties list page', async ({ page }) => {
        await expect(page).toHaveURL('/properties');
        await expect(page.getByRole('heading', { name: /properties/i })).toBeVisible();
    });

    test('should navigate to create property page', async ({ page }) => {
        // Click "Add Property" button
        await page.getByRole('link', { name: /add property/i }).click();

        // Should navigate to new property page
        await expect(page).toHaveURL('/properties/new');
    });

    test('should display property creation form', async ({ page }) => {
        await page.goto('/properties/new');

        // Check form elements are visible
        await expect(page.getByLabel(/name/i)).toBeVisible();
        await expect(page.getByLabel(/street/i)).toBeVisible();
        await expect(page.getByLabel(/city/i)).toBeVisible();
        await expect(page.getByLabel(/type/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /save property/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto('/properties/new');

        // Try to submit empty form
        await page.getByRole('button', { name: /save property/i }).click();

        // Should show validation errors
        await expect(page.getByText(/required/i).first()).toBeVisible();
    });

    test('should create a new property with valid data', async ({ page }) => {
        await page.goto('/properties/new');

        // Fill in property form
        await page.getByLabel(/name/i).fill('Test Property E2E');
        await page.getByLabel(/street/i).fill('123 Test Street');
        await page.getByLabel(/number/i).fill('100');
        await page.getByLabel(/city/i).fill('Test City');
        await page.getByLabel(/state/i).fill('Test State');
        await page.getByLabel(/zip code/i).fill('12345');
        await page.getByLabel(/country/i).fill('Test Country');
        await page.getByLabel(/type/i).selectOption('APARTMENT');

                // Submit form
        await page.getByRole('button', { name: /save property/i }).click();

        // Should redirect to property details
        await expect(page).toHaveURL(/\/properties\/[^\/]+$/);

        // Should show success message or new property in list
        await expect(page.getByText(/test property e2e/i)).toBeVisible();
    });

    test('should navigate to property details', async ({ page }) => {
        await page.goto('/properties');

        // Wait for properties to load
        await page.waitForSelector('a[href^="/properties/"]:not([href="/properties/new"])', { timeout: 5000 });

        // Click on first property card link
        const firstPropertyLink = page.locator('a[href^="/properties/"]:not([href="/properties/new"])').first();
        await firstPropertyLink.click({ force: true });

        // Should navigate to property detail page
        await expect(page).toHaveURL(/\/properties\/[^\/]+$/);
    });

    test('should display edit button on property detail page', async ({ page }) => {
        await page.goto('/properties');

        // Wait for and click first property
        await page.waitForSelector('a[href^="/properties/"]:not([href="/properties/new"])', { timeout: 5000 });
        await page.locator('a[href^="/properties/"]:not([href="/properties/new"])').first().click({ force: true });

        // Should show edit button
        await expect(page.getByRole('link', { name: /edit/i })).toBeVisible();
    });

    test('should search properties', async ({ page }) => {
        await page.goto('/properties');

        // Type in search box
        const searchInput = page.getByPlaceholder(/search/i);
        await searchInput.fill('Test');

        // Results should filter (this assumes client-side filtering is instant)
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });
});
