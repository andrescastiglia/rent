import { loginAsAdmin, relaunchFreshApp } from './helpers';

describe('Auth and navigation', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
  });

  it('logs in and can open core tabs', async () => {
    await loginAsAdmin();

    await element(by.id('tab.properties')).tap();
    await expect(element(by.id('properties.new'))).toBeVisible();

    await element(by.id('tab.tenants')).tap();
    await expect(element(by.id('tenants.new'))).toBeVisible();

    await element(by.id('tab.payments')).tap();
    await expect(element(by.id('payments.search'))).toBeVisible();

    await element(by.id('tab.interested')).tap();
    await expect(element(by.id('interested.new'))).toBeVisible();

    await element(by.id('tab.settings')).tap();
    await element(by.id('settings.goto.leases')).tap();
    await expect(element(by.id('leases.search'))).toBeVisible();
  });
});
