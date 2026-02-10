import { test, expect, login, localePath } from './fixtures/auth';

const leaseDetailLinkSelector = 'a[href*="/leases/"]:not([href*="/leases/new"]):not([href*="/leases/templates"]):not([href*="/edit"])';

test.describe('Lease Creation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/leases'));
    });

    test('should display leases list page', async ({ page }) => {
        await expect(page).toHaveURL(/\/es\/leases/);
        await expect(page.getByRole('heading', { name: /leases|contratos/i })).toBeVisible();
    });

    test('should navigate to create lease page', async ({ page }) => {
        // New flow: create lease action is on property details
        await page.goto(localePath('/properties'));
        await page.waitForSelector('a[href*="/properties/"]:not([href*="/new"]):not([href*="/edit"])', { timeout: 10000 });
        await page.locator('a[href*="/properties/"]:not([href*="/new"]):not([href*="/edit"])').first().click({ force: true });

        await page.getByRole('link', { name: /create lease|crear contrato|criar contrato/i }).click();

        // Should navigate to new lease page
        await expect(page).toHaveURL(/\/es\/leases\/new/);
    });

    test('should display lease creation form', async ({ page }) => {
        await page.goto(localePath('/leases/new'));

        // Check form elements are visible
        await expect(page.getByLabel(/property|propiedad/i)).toBeVisible();
        await expect(page.getByLabel(/tenant|inquilino/i)).toBeVisible();
        await expect(page.getByLabel(/start date|fecha.*inicio/i)).toBeVisible();
        await expect(page.getByLabel(/end date|fecha.*fin/i)).toBeVisible();
        await expect(page.getByLabel(/rent amount|monto.*alquiler/i)).toBeVisible();
        await expect(page.getByRole('button', { name: /save|guardar/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
        await page.goto(localePath('/leases/new'));

        // Try to submit empty form
        await page.getByRole('button', { name: /save|guardar/i }).click();

        // Should show validation errors
        await expect(page.getByText(/required|requerido|obrigatório/i).first()).toBeVisible();
    });

    test('should create a new lease with valid data', async ({ page }) => {
        await page.goto(localePath('/leases/new'));

        // Fill in lease form
        await page.getByLabel(/property|propiedad/i).selectOption({ index: 1 }); // Select first property
        await page.getByLabel(/tenant|inquilino/i).selectOption({ index: 1 }); // Select first tenant
        await page.getByLabel(/start date|fecha.*inicio/i).fill('2024-01-01');
        await page.getByLabel(/end date|fecha.*fin/i).fill('2024-12-31');
        await page.getByLabel(/rent amount|monto.*alquiler/i).fill('1500');
        await page.getByLabel(/deposit|depósito/i).fill('3000');
        await page.getByLabel(/status|estado/i).selectOption('DRAFT');

        // Submit form
        await page.getByRole('button', { name: /save|guardar/i }).click();

        // Should redirect to lease details
        await expect(page).toHaveURL(/\/es\/leases\/[^/]+$/);
    });

    test('should navigate to lease details', async ({ page }) => {
        await page.goto(localePath('/leases'));

        // Wait for leases to load
        await page.waitForSelector(leaseDetailLinkSelector, { timeout: 5000 });

        // Click on first lease card link
        const firstLeaseLink = page.locator(leaseDetailLinkSelector).first();
        await firstLeaseLink.click({ force: true });

        // Should navigate to lease detail page
        await expect(page).toHaveURL(/\/es\/leases\/[^/]+$/);
    });

    test('should display lease details correctly', async ({ page }) => {
        await page.goto(localePath('/leases'));

        // Wait for and click first lease
        await page.waitForSelector(leaseDetailLinkSelector, { timeout: 5000 });
        await page.locator(leaseDetailLinkSelector).first().click({ force: true });

        // Should show lease information sections
        await expect(page.getByRole('heading', { name: /lease|contrato/i })).toBeVisible();
    });

    test('should display edit and delete buttons on lease detail page', async ({ page }) => {
        await page.goto(localePath('/leases'));

        // Wait for and click first lease
        await page.waitForSelector(leaseDetailLinkSelector, { timeout: 5000 });
        await page.locator(leaseDetailLinkSelector).first().click({ force: true });

        // Should show edit/new-version and delete buttons
        await expect(page.locator('a[href*="/leases/"][href$="/edit"]')).toBeVisible();
        await expect(page.getByRole('button', { name: /delete|eliminar/i })).toBeVisible();
    });

    test('should search leases', async ({ page }) => {
        await page.goto(localePath('/leases'));

        // Type in search box
        const searchInput = page.getByPlaceholder(/search|buscar/i);
        await searchInput.fill('Test');

        // Wait for filter to apply
        await page.waitForTimeout(500);

        // Search input should have the value
        await expect(searchInput).toHaveValue('Test');
    });

    test('should navigate to edit lease page', async ({ page }) => {
        await page.goto(localePath('/leases'));

        // Wait for and click first lease
        await page.waitForSelector(leaseDetailLinkSelector, { timeout: 5000 });
        await page.locator(leaseDetailLinkSelector).first().click({ force: true });

        // Click edit/new-version button
        await page.locator('a[href*="/leases/"][href$="/edit"]').click({ force: true });

        // Should navigate to edit page
        await expect(page).toHaveURL(/\/es\/leases\/[^/]+\/edit$/);

        // Should show form with existing data
        await expect(page.getByRole('button', { name: /save|guardar/i })).toBeVisible();
    });
});
