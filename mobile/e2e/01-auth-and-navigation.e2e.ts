import { loginAsAdmin, relaunchFreshApp } from './helpers';

describe('Auth and navigation', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
  });

  it('logs in and can open core tabs', async () => {
    await loginAsAdmin();

    await element(by.id('tab.properties')).tap();
    await waitFor(element(by.id('properties.owners.search')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('tab.tenants')).tap();
    await waitFor(element(by.id('tenants.new')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('tab.payments')).tap();
    await waitFor(element(by.id('payments.search')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('tab.interested')).tap();
    await waitFor(element(by.id('interested.new')))
      .toBeVisible()
      .withTimeout(15000);

    await element(by.id('tab.settings')).tap();
    await element(by.id('settings.goto.leases')).tap();
    await waitFor(element(by.id('leases.search')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
