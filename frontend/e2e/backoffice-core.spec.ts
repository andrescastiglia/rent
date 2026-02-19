import { expect, localePath, login, test } from './fixtures/auth';

test.describe('Backoffice Core', () => {
  test.setTimeout(60000);
  test.describe.configure({ mode: 'serial' });

  test('users: create, edit, reset password and toggle activation', async ({
    page,
  }) => {
    await login(page);
    await page.goto(localePath('/users'));

    await expect(
      page.getByRole('heading', { name: /usuarios|users|usu[aá]rios/i }),
    ).toBeVisible();

    const userEmail = `e2e.user.${Date.now()}@example.com`;

    await page
      .getByRole('button', { name: /nuevo usuario|new user|novo usu[aá]rio/i })
      .click();

    const userForm = page.locator('form').first();
    await userForm.locator('input[type="email"]').fill(userEmail);
    await userForm.locator('input[type="text"]').nth(0).fill('E2E');
    await userForm.locator('input[type="text"]').nth(1).fill('User');
    await userForm.locator('input[type="text"]').nth(2).fill('+54 9 11 0000');
    await userForm.locator('input[type="password"]').fill('SecurePass123!');
    await userForm
      .getByRole('button', { name: /crear|create|criar/i })
      .click();

    await expect(
      page.getByText(
        /usuario creado correctamente|user created successfully|usu[aá]rio criado com sucesso/i,
      ),
    ).toBeVisible();

    let userRow = page.locator('tr', { hasText: userEmail }).first();
    await expect(userRow).toBeVisible();

    await userRow
      .getByRole('button', { name: /editar|edit|editar/i })
      .click();

    const editForm = page.locator('form').first();
    await editForm.locator('input[type="text"]').nth(0).fill('E2EUpdated');
    await editForm
      .getByRole('button', { name: /guardar|save|salvar/i })
      .click();

    await expect(
      page.getByText(
        /usuario actualizado correctamente|user updated successfully|usu[aá]rio atualizado com sucesso/i,
      ),
    ).toBeVisible();

    userRow = page.locator('tr', { hasText: userEmail }).first();
    await expect(userRow).toContainText('E2EUpdated');

    await userRow
      .getByRole('button', {
        name: /blanquear clave|reset password|redefinir senha/i,
      })
      .click();

    const resetModal = page.locator('div.fixed.inset-0').last();
    await expect(resetModal).toBeVisible();
    await resetModal.locator('input[type="password"]').fill('ResetPass123!');
    await resetModal
      .getByRole('button', { name: /confirmar|confirm|confirmar/i })
      .click();

    await expect(
      page.getByText(/contrase(?:\u00f1|n)a blanqueada|password reset|senha redefinida/i),
    ).toBeVisible();

    userRow = page.locator('tr', { hasText: userEmail }).first();
    await userRow
      .getByRole('button', { name: /desactivar|deactivate|desativar/i })
      .click();

    await expect(
      page.getByText(
        /usuario desactivado correctamente|user deactivated successfully|usu[aá]rio desativado com sucesso/i,
      ),
    ).toBeVisible();
  });

  test('settings: update profile and change password', async ({ page }) => {
    await login(page);
    await page.goto(localePath('/settings'));

    await expect(
      page.getByRole('heading', {
        name: /configuraci[oó]n de usuario|user settings|configura[cç][aã]o de usu[aá]rio/i,
      }),
    ).toBeVisible();

    const profileForm = page.locator('form').first();
    await profileForm
      .getByRole('button', { name: /guardar|save|salvar/i })
      .click();

    await expect(
      page.getByText(
        /perfil actualizado correctamente|profile updated successfully|perfil atualizado com sucesso/i,
      ),
    ).toBeVisible();

    const passwordForm = page.locator('form').nth(1);
    await passwordForm.locator('input[type="password"]').nth(0).fill('current');
    await passwordForm
      .locator('input[type="password"]')
      .nth(1)
      .fill('NewPassword123!');
    await passwordForm
      .locator('input[type="password"]')
      .nth(2)
      .fill('NewPassword123!');
    await passwordForm
      .getByRole('button', {
        name: /cambiar contrase(?:\u00f1|n)a|change password|alterar senha/i,
      })
      .click();

    await expect(
      page.getByText(
        /contrase(?:\u00f1|n)a actualizada correctamente|password updated successfully|senha atualizada com sucesso/i,
      ),
    ).toBeVisible();
  });

  test('templates editor: create template from editor', async ({ page }) => {
    await login(page);
    await page.goto(localePath('/templates'));

    await expect(
      page.getByRole('heading', {
        name: /plantillas de comprobantes|templates|modelos de documentos/i,
      }),
    ).toBeVisible();

    await page
      .getByRole('link', {
        name: /nueva plantilla|new template|novo modelo/i,
      })
      .click();
    await expect(page).toHaveURL(/\/(es|en|pt)\/templates\/editor/);

    const templateName = `Template E2E ${Date.now()}`;
    const nameInput = page.locator('input[type="text"]').first();
    const bodyInput = page.locator('textarea').first();

    await nameInput.fill(templateName);
    await bodyInput.fill('Contenido base de plantilla e2e');

    const variableButton = page
      .locator('button')
      .filter({ hasText: '{{' })
      .first();
    if (await variableButton.isVisible()) {
      await variableButton.click();
    }

    await page
      .getByRole('button', { name: /guardar|save|salvar/i })
      .click();

    await expect(page).toHaveURL(/\/(es|en|pt)\/templates\?scope=/);
    await expect(page.getByText(templateName)).toBeVisible();
  });
});
