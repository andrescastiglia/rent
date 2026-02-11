import { test, expect, login, localePath } from './fixtures/auth';

async function gotoProspectWithRetry(page: Parameters<typeof login>[0]) {
    const target = localePath('/prospect');

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForURL(/\/es\/prospect$/, { timeout: 10000 });
            return;
        } catch (error) {
            const message = String(error);
            const retriable =
                message.includes('ERR_ABORTED') ||
                message.includes('frame was detached');

            if (!retriable || attempt === 2) {
                throw error;
            }

            await page.waitForTimeout(300);
        }
    }
}

test.describe('Interested Matchmaking', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await gotoProspectWithRetry(page);
    });

    test('should list interested profiles and show no matches in mock data', async ({ page }) => {
        await expect(page.getByPlaceholder(/buscar por nombre|search by name/i)).toBeVisible();
        await expect(page.getByRole('link', { name: /editar interesado|edit interested/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /agregar actividad|add activity/i }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /nuevo contrato|new .*contract/i })).toHaveCount(0);

        const firstProfileSelectButton = page.locator('button.w-full.text-left').first();
        await expect(firstProfileSelectButton).toBeVisible();
        await firstProfileSelectButton.click();
        await expect(page.getByText('No hay coincidencias para este perfil.')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Actividades|Activities/i })).toBeVisible();
        await expect(page.getByText(/Sin actividades cargadas.|No activities/i)).toBeVisible();
        await expect(page.getByRole('link', { name: /nuevo contrato|new .*contract/i })).toHaveCount(0);
    });
});
