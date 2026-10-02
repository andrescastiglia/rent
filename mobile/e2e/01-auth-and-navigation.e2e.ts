import { openModule } from './helpers';
import { loginAsAdmin, relaunchFreshApp } from './helpers';

describe('Auth and navigation', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
  });

  it('logs in and can open core tabs', async () => {
    await loginAsAdmin();

    await openModule('properties');
    await waitFor(element(by.id('properties.search')))
      .toBeVisible()
      .withTimeout(15000);

    await openModule('tenants');
    await waitFor(element(by.id('tenants.new')))
      .toBeVisible()
      .withTimeout(15000);

    await openModule('payments');
    await waitFor(element(by.id('payments.search')))
      .toBeVisible()
      .withTimeout(15000);

    await openModule('interested');
    await waitFor(element(by.id('interested.new')))
      .toBeVisible()
      .withTimeout(15000);

    await openModule('leases');
    await waitFor(element(by.id('leases.search')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
