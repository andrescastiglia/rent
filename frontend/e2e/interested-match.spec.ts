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

    test('should create interested profile and show no matches', async ({ page }) => {
        const unique = Date.now().toString().slice(-6);
        const firstName = `Sofia${unique}`;
        const lastName = `Gomez${unique}`;
        const phone = `+54 9 11 90${unique}`;

        await page.getByRole('button', { name: /nuevo interesado|nueva persona|new interested|new person/i }).click();
        await page.getByPlaceholder('Teléfono').fill(phone);
        await page.getByPlaceholder('Nombre', { exact: true }).fill(firstName);
        await page.getByPlaceholder('Apellido', { exact: true }).fill(lastName);
        await page.getByRole('button', { name: /guardar interesado/i }).click();

        const fullNamePattern = new RegExp(`${firstName}\\s+${lastName}`, 'i');
        const personListItem = page.getByRole('button', { name: fullNamePattern }).first();
        await expect(personListItem).toBeVisible();
        await personListItem.click();

        await expect(page.getByText('No hay coincidencias para este perfil.')).toBeVisible();
    });
});
