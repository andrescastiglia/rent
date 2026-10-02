import { fillField, openModule, waitForFormControl } from './helpers';
import {
  loginAsAdmin,
  relaunchFreshApp,
  tapAndConfirmDeletion,
} from './helpers';

describe('Tenants CRUD', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('creates, edits and deletes a tenant', async () => {
    const uniqueBase = Date.now().toString();
    const email = `tenant.${uniqueBase}@example.com`;
    const updatedEmail = `tenant.updated.${uniqueBase}@example.com`;

    await openModule('tenants');
    await waitFor(element(by.id('tenants.new')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('tenants.new')).tap();
    await waitFor(element(by.id('tenantCreate.firstName')))
      .toBeVisible()
      .withTimeout(15000);

    await fillField('tenantCreate.firstName', 'E2E', 'tenantCreate.scroll');
    await fillField('tenantCreate.lastName', 'Tenant', 'tenantCreate.scroll');
    await fillField('tenantCreate.email', email, 'tenantCreate.scroll');
    await fillField(
      'tenantCreate.phone',
      '+5491112345678',
      'tenantCreate.scroll',
    );
    await fillField(
      'tenantCreate.dni',
      uniqueBase.slice(0, 8),
      'tenantCreate.scroll',
    );
    await waitForFormControl('tenantCreate.submit', 'tenantCreate.scroll');
    await element(by.id('tenantCreate.submit')).tap();

    await waitForFormControl('tenantDetail.edit', 'tenantDetail.scroll');

    await element(by.id('tenantDetail.edit')).tap();
    await waitFor(element(by.id('tenantEdit.email')))
      .toBeVisible()
      .withTimeout(10000);
    await fillField('tenantEdit.email', updatedEmail, 'tenantEdit.scroll');
    await waitForFormControl('tenantEdit.submit', 'tenantEdit.scroll');
    await element(by.id('tenantEdit.submit')).tap();

    await waitFor(element(by.text(updatedEmail)))
      .toBeVisible()
      .withTimeout(15000);

    await tapAndConfirmDeletion('tenantDetail.delete', 'tenantDetail.scroll');
    await waitFor(element(by.id('tenants.new')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
