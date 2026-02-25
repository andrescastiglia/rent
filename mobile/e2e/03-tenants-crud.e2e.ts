import { loginAsAdmin, relaunchFreshApp, tapAndConfirmDeletion } from './helpers';

describe('Tenants CRUD', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('creates, edits and deletes a tenant', async () => {
    const uniqueBase = Date.now().toString();
    const email = `tenant.${uniqueBase}@example.com`;
    const updatedEmail = `tenant.updated.${uniqueBase}@example.com`;

    await element(by.id('tab.tenants')).tap();
    await element(by.id('tenants.new')).tap();

    await element(by.id('tenantCreate.firstName')).replaceText('E2E');
    await element(by.id('tenantCreate.lastName')).replaceText('Tenant');
    await element(by.id('tenantCreate.email')).replaceText(email);
    await element(by.id('tenantCreate.phone')).replaceText('+5491112345678');
    await element(by.id('tenantCreate.dni')).replaceText(uniqueBase.slice(0, 8));
    await waitFor(element(by.id('tenantCreate.submit')))
      .toBeVisible()
      .whileElement(by.id('tenantCreate.scroll'))
      .scroll(220, 'down');
    await element(by.id('tenantCreate.submit')).tap();

    await waitFor(element(by.id('tenantDetail.edit'))).toBeVisible().withTimeout(15000);

    await element(by.id('tenantDetail.edit')).tap();
    await waitFor(element(by.id('tenantEdit.email'))).toBeVisible().withTimeout(10000);
    await element(by.id('tenantEdit.email')).replaceText(updatedEmail);
    await waitFor(element(by.id('tenantEdit.submit')))
      .toBeVisible()
      .whileElement(by.id('tenantEdit.scroll'))
      .scroll(220, 'down');
    await element(by.id('tenantEdit.submit')).tap();

    await waitFor(element(by.text(updatedEmail))).toBeVisible().withTimeout(15000);

    await tapAndConfirmDeletion('tenantDetail.delete');
    await waitFor(element(by.id('tenants.new'))).toBeVisible().withTimeout(15000);
  });
});
