import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Interested Matchmaking', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/prospect'));
    });

    test('should create interested profile and show no matches', async ({ page }) => {
        await page.getByRole('button', { name: /nueva persona|nuevo prospecto/i }).click();
        await page.getByPlaceholder('Teléfono').fill('+54 9 11 0000-0000');
        await page.getByPlaceholder('Nombre', { exact: true }).fill('Sofia');
        await page.getByPlaceholder('Apellido', { exact: true }).fill('Gomez');
        await page.getByRole('button', { name: /guardar interesado/i }).click();

        await expect(page.getByText('Sofia Gomez')).toBeVisible();
        await page.getByText('Sofia Gomez').click();
        await page.getByRole('button', { name: /propiedades|properties/i }).click();

        await expect(page.getByText('No hay coincidencias para este perfil.')).toBeVisible();
    });
});
