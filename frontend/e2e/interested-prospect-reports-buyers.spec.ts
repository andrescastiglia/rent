import { expect, localePath, login, test } from './fixtures/auth';

test.describe('Interested, Prospect, Reports and Buyers', () => {
  test.setTimeout(60000);
  test.describe.configure({ mode: 'serial' });

  test('interested/prospect full flow: new, edit, activity and confirm-match fallback', async ({
    page,
  }) => {
    await login(page);
    await page.goto(localePath('/prospect'));
    await expect(page).toHaveURL(/\/(es|en|pt)\/prospect/);

    await page
      .getByRole('link', {
        name: /nuevo interesado|new interested|novo interessado/i,
      })
      .click();
    await expect(page).toHaveURL(/\/(es|en|pt)\/interested\/new/);

    const stamp = Date.now();
    const firstName = `E2E${stamp}`;
    const lastName = 'Prospect';
    const phone = `+54911${String(stamp).slice(-7)}`;
    const email = `e2e.interested.${stamp}@example.com`;

    const createForm = page.locator('form').first();
    await createForm.locator('input[type="text"]').nth(0).fill(firstName);
    await createForm.locator('input[type="text"]').nth(1).fill(lastName);
    await createForm.locator('input[type="text"]').nth(2).fill(phone);
    await createForm.locator('input[type="email"]').fill(email);
    await createForm
      .getByRole('button', {
        name: /guardar interesado|save interested|salvar interessado/i,
      })
      .click();

    await expect(page).toHaveURL(/\/(es|en|pt)\/interested$/);
    await expect(page.locator('body')).toContainText(firstName);

    const editLink = page.locator('a[href*="/interested/"][href$="/edit"]').first();
    const editHref = await editLink.getAttribute('href');
    expect(editHref).toBeTruthy();
    const interestedId = editHref?.match(/\/interested\/([^/]+)\/edit/)?.[1];
    expect(interestedId).toBeTruthy();
    await editLink.click();

    await expect(page).toHaveURL(/\/(es|en|pt)\/interested\/[^/]+\/edit$/);
    const editForm = page.locator('form').first();
    await editForm
      .locator('input[type="text"]')
      .nth(2)
      .fill(`${phone}9`);
    await editForm
      .getByRole('button', {
        name: /guardar interesado|save interested|salvar interessado/i,
      })
      .click();

    await expect(page).toHaveURL(/\/(es|en|pt)\/interested$/);

    await page
      .locator(`a[href*="/interested/${interestedId}/activities/new"]`)
      .first()
      .click();
    await expect(page).toHaveURL(
      /\/(es|en|pt)\/interested\/[^/]+\/activities\/new$/,
    );

    const activityForm = page.locator('form').first();
    await activityForm
      .locator('input[type="text"]')
      .first()
      .fill(`Seguimiento ${stamp}`);
    await activityForm.locator('textarea').fill('Actividad generada por e2e.');
    await activityForm
      .getByRole('button', {
        name: /agregar actividad|add activity|adicionar atividade/i,
      })
      .click();

    await expect(page).toHaveURL(/\/(es|en|pt)\/interested$/);

    const profileButton = page
      .locator('button.w-full.text-left')
      .filter({ hasText: firstName })
      .first();
    await expect(profileButton).toBeVisible();
    await profileButton.click();

    const confirmButtons = page.getByRole('button', {
      name: /confirmar alquiler|confirm rent|confirmar aluguel|confirmar compra|confirm purchase/i,
    });
    if ((await confirmButtons.count()) > 0) {
      await confirmButtons.first().click();
      await expect(
        page.getByText(/aceptado|accepted|aceito/i),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(
          /no hay coincidencias para este perfil|no matches for this profile|sem correspond[eê]ncias para este perfil/i,
        ),
      ).toBeVisible();
    }
  });

  test('reports and buyers pages render key business information', async ({
    page,
  }) => {
    await login(page);

    await page.goto(localePath('/reports'));
    await expect(
      page.getByRole('heading', { name: /reportes|reports|relat[oó]rios/i }),
    ).toBeVisible();

    const hasReportsTable = (await page.locator('table').count()) > 0;
    if (hasReportsTable) {
      await expect(page.locator('tbody tr').first()).toBeVisible();
    } else {
      await expect(
        page.getByText(
          /no hay reportes generados para mostrar|no generated reports to display|n[aã]o h[aá] relat[oó]rios gerados/i,
        ),
      ).toBeVisible();
    }

    await page.goto(localePath('/buyers'));
    await expect(
      page.getByRole('heading', {
        name: /compradores|buyers|compradores/i,
      }),
    ).toBeVisible();

    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill('Prospect');
    await expect(searchInput).toHaveValue('Prospect');

    const hasBuyerCards = (await page.locator('a.action-link').count()) > 0;
    if (hasBuyerCards) {
      await expect(page.locator('a.action-link').first()).toBeVisible();
    } else {
      await expect(
        page.getByText(
          /no hay compradores registrados|no buyers registered|n[aã]o h[aá] compradores cadastrados/i,
        ),
      ).toBeVisible();
    }
  });
});
