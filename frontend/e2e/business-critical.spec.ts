import { expect, localePath, login, test } from './fixtures/auth';

test.describe('Business Critical Flows', () => {
  test.setTimeout(60000);
  test.describe.configure({ mode: 'serial' });

  test('payment create + confirm + receipt download and invoice detail download', async ({
    page,
  }) => {
    await login(page);
    await page.goto(localePath('/payments/new'));

    const leaseSelect = page
      .locator('select')
      .filter({
        has: page
          .locator('option')
          .filter({
            hasText:
              /selecciona un contrato activo|select an active lease|selecione um contrato ativo/i,
          }),
      })
      .first();
    await expect(leaseSelect).toBeVisible();
    await expect
      .poll(async () => leaseSelect.locator('option').count())
      .toBeGreaterThan(1);
    await leaseSelect.selectOption({ index: 1 });
    await expect
      .poll(async () =>
        leaseSelect.evaluate(
          (node) => (node as HTMLSelectElement).selectedIndex,
        ),
      )
      .toBe(1);

    const amountInput = page.locator('input[type="number"][min="0.01"]').first();
    await expect(amountInput).toBeVisible();
    await amountInput.fill('1500');

    const savePaymentButton = page.getByRole('button', {
      name: /guardar pago|save payment|salvar pagamento/i,
    });
    await expect(savePaymentButton).toBeEnabled({ timeout: 15000 });
    await Promise.all([
      page.waitForURL(/\/(es|en|pt)\/payments\/[^/]+$/, { timeout: 15000 }),
      savePaymentButton.click(),
    ]);

    const confirmPaymentButton = page.getByRole('button', {
      name: /confirmar pago|confirm payment|confirmar pagamento/i,
    });

    const downloadReceiptButton = page.getByRole('button', {
      name: /descargar recibo|download receipt|baixar recibo/i,
    });

    await expect
      .poll(async () => {
        if (await confirmPaymentButton.isVisible().catch(() => false)) {
          return 'confirm';
        }
        if (await downloadReceiptButton.isVisible().catch(() => false)) {
          return 'receipt';
        }
        return 'pending';
      })
      .not.toBe('pending');

    if (await confirmPaymentButton.isVisible().catch(() => false)) {
      await confirmPaymentButton.click();
      await expect(downloadReceiptButton).toBeVisible({ timeout: 10000 });
    }

    const [receiptDownload] = await Promise.all([
      page.waitForEvent('download'),
      downloadReceiptButton.click(),
    ]);
    expect(receiptDownload.suggestedFilename().toLowerCase()).toContain(
      'recibo',
    );

    await page.goto(localePath('/invoices/inv2'));
    const downloadInvoiceButton = page.getByRole('button', {
      name: /descargar pdf|download pdf|baixar pdf/i,
    });
    await expect(downloadInvoiceButton).toBeVisible();

    const [invoiceDownload] = await Promise.all([
      page.waitForEvent('download'),
      downloadInvoiceButton.click(),
    ]);
    expect(invoiceDownload.suggestedFilename().toLowerCase()).toContain(
      'factura',
    );
  });

  test('lease detail supports contract actions and delete', async ({ page }) => {
    await login(page);
    await page.goto(localePath('/leases/2'));
    await expect(page).toHaveURL(/\/(es|en|pt)\/leases\/2$/);

    const draftTextarea = page.locator('textarea').first();
    await expect(draftTextarea).toBeVisible();

    const renderFromTemplateButton = page.getByRole('button', {
      name: /regenerar desde plantilla|render from template|regenerar a partir de modelo/i,
    });
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await renderFromTemplateButton.click();

    await draftTextarea.fill('Contrato e2e editado');
    await page
      .getByRole('button', {
        name: /guardar borrador|save draft|salvar rascunho/i,
      })
      .click();
    await expect(draftTextarea).toHaveValue('Contrato e2e editado');

    const confirmContractButton = page.getByRole('button', {
      name: /confirmar contrato|confirm contract|confirmar contrato/i,
    });
    await confirmContractButton.click();
    await expect(confirmContractButton).toBeHidden({ timeout: 10000 });

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page
      .getByRole('button', { name: /eliminar|delete|excluir/i })
      .click();
    await expect(page).toHaveURL(/\/(es|en|pt)\/leases$/);
  });
});
