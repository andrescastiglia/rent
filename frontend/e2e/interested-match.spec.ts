import { test, expect, login, localePath } from './fixtures/auth';

test.describe('Interested Matchmaking', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await page.goto(localePath('/interested'));
    });

    test('should create interested profile and show no matches', async ({ page }) => {
        await page.getByPlaceholder('Teléfono').fill('+54 9 11 0000-0000');
        await page.getByPlaceholder('Nombre').fill('Sofia');
        await page.getByPlaceholder('Apellido').fill('Gomez');
        await page.getByRole('button', { name: /guardar interesado/i }).click();

        await expect(page.getByText('Sofia Gomez')).toBeVisible();
        await page.getByText('Sofia Gomez').click();

        await expect(page.getByText('No hay coincidencias para este perfil.')).toBeVisible();
    });
});
