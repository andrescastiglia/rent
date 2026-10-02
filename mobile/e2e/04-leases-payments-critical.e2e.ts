import { openModule } from './helpers';
import {
  dismissNativeAlertIfVisible,
  loginAsAdmin,
  relaunchFreshApp,
} from './helpers';

describe('Leases and payments critical flows', () => {
  beforeAll(async () => {
    await relaunchFreshApp();
    await loginAsAdmin();
  });

  it('payment create + confirm + invoice PDF flows', async () => {
    await openModule('tenants');
    await waitFor(element(by.id('tenant.payment.new.1')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('tenant.payment.new.1')).tap();

    await waitFor(element(by.id('tenantPaymentCreate.amount')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('tenantPaymentCreate.amount')).replaceText('1234');
    await element(by.id('tenantPaymentCreate.submit')).tap();

    await waitFor(element(by.id('paymentDetail.confirm')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('paymentDetail.confirm')).tap();
    await dismissNativeAlertIfVisible();

    await waitFor(element(by.id('paymentDetail.downloadReceipt')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('paymentDetail.downloadReceipt')).tap();
    await dismissNativeAlertIfVisible();

    await relaunchFreshApp();
    await loginAsAdmin();
    await openModule('payments');
    await waitFor(element(by.id('payments.search')))
      .toBeVisible()
      .withTimeout(15000);

    await relaunchFreshApp();
    await loginAsAdmin();
    await openModule('leases');
    await waitFor(element(by.id('leases.search')))
      .toBeVisible()
      .withTimeout(15000);

    await relaunchFreshApp();
    await loginAsAdmin();
    await openModule('invoices');

    await waitFor(element(by.id('invoices.item.inv1')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('invoices.item.inv1')).tap();

    await waitFor(element(by.id('invoiceDetail.downloadPdf')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('invoiceDetail.downloadPdf')).tap();
    await dismissNativeAlertIfVisible();
  });
});
