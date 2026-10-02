import { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import NewPayment from '../app/(app)/payments/new';
import NewTenantPayment from '../app/(app)/tenants/[id]/payments/new';
import PaymentDetail from '../app/(app)/payments/[id]/index';
import InvoiceDetail from '../app/(app)/invoices/[id]/index';
import SaleDetail from '../app/(app)/sales/[id]/index';
import OwnerPayment from '../app/(app)/owners/[id]/pay';
import { leasesApi } from '@/api/leases';
import { tenantsApi } from '@/api/tenants';
import { invoicesApi, paymentsApi, tenantAccountsApi } from '@/api/payments';
import { salesApi } from '@/api/sales';
import { ownersApi } from '@/api/owners';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  settle,
  textContent,
} from './render';

beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'selected-id' });
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
const payment = {
  id: 'selected-id',
  tenantAccountId: 'account-1',
  amount: 125.5,
  currencyCode: 'USD',
  paymentDate: '2026-10-01',
  method: 'cash',
  reference: null,
  notes: null,
  status: 'pending',
  activityType: 'monthly',
  createdAt: '',
  updatedAt: '',
} as const;
function button(app: ReactTestRenderer, label: string) {
  return app.root.findAll(
    (node) =>
      (node.type as unknown) === 'Pressable' &&
      node.props.accessibilityLabel === label,
  )[0];
}
async function click(app: ReactTestRenderer, label: string) {
  await act(async () => {
    button(app, label).props.onPress();
  });
  await settle();
}

it('resolves the selected tenant account and creates one payment with precise money and optional context', async () => {
  jest.spyOn(leasesApi, 'getAll').mockResolvedValue([]);
  const account = jest
    .spyOn(tenantAccountsApi, 'getByLease')
    .mockResolvedValue({ id: 'account-1' } as never);
  const create = jest
    .spyOn(paymentsApi, 'create')
    .mockResolvedValue({ ...payment, id: 'created-payment' });
  const app = await renderApp(<NewPayment />);
  await input(app, 'paymentCreate.leaseId', 'lease-1');
  await input(app, 'paymentCreate.amount', '125,50');
  await input(app, 'paymentCreate.reference', 'Bank trace');
  await input(app, 'paymentCreate.notes', 'Partial rent');
  await press(app, 'paymentCreate.method.cash');
  await press(app, 'paymentCreate.activityType.adjustment');
  await press(app, 'paymentCreate.submit');
  expect(account).toHaveBeenCalledWith('lease-1');
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      tenantAccountId: 'account-1',
      amount: 125.5,
      method: 'cash',
      activityType: 'adjustment',
      reference: 'Bank trace',
      notes: 'Partial rent',
    }),
  );
  expect(router.replace).toHaveBeenCalledWith(
    '/(app)/payments/created-payment',
  );
  expect(create).toHaveBeenCalledTimes(1);
});
it.each(['0', '-10', 'not-a-number', '1.123', 'Infinity'])(
  'blocks invalid payment amount %s before accessing or mutating an account',
  async (amount) => {
    jest.spyOn(leasesApi, 'getAll').mockResolvedValue([]);
    const account = jest.spyOn(tenantAccountsApi, 'getByLease');
    const create = jest.spyOn(paymentsApi, 'create');
    const app = await renderApp(<NewPayment />);
    await input(app, 'paymentCreate.leaseId', 'lease-1');
    await input(app, 'paymentCreate.amount', amount);
    await press(app, 'paymentCreate.submit');
    expect(account).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(control(app, 'paymentCreate.amount').props.value).toBe(amount);
  },
);
it('does not create a payment when the lease has no tenant account', async () => {
  jest.spyOn(leasesApi, 'getAll').mockResolvedValue([]);
  jest.spyOn(tenantAccountsApi, 'getByLease').mockResolvedValue(null);
  const create = jest.spyOn(paymentsApi, 'create');
  const app = await renderApp(<NewPayment />);
  await input(app, 'paymentCreate.leaseId', 'lease-1');
  await input(app, 'paymentCreate.amount', '100');
  await press(app, 'paymentCreate.submit');
  expect(create).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'tenants.paymentRegistration.noAccount',
  );
  expect(router.replace).not.toHaveBeenCalled();
});
it('preserves an uncertain payment form after network failure and waits for explicit retry', async () => {
  jest.spyOn(leasesApi, 'getAll').mockResolvedValue([]);
  jest
    .spyOn(tenantAccountsApi, 'getByLease')
    .mockResolvedValue({ id: 'account-1' } as never);
  const create = jest
    .spyOn(paymentsApi, 'create')
    .mockRejectedValue(new Error('Connection interrupted'));
  const app = await renderApp(<NewPayment />);
  await input(app, 'paymentCreate.leaseId', 'lease-1');
  await input(app, 'paymentCreate.amount', '100');
  await press(app, 'paymentCreate.submit');
  expect(create).toHaveBeenCalledTimes(1);
  expect(control(app, 'paymentCreate.amount').props.value).toBe('100');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'Connection interrupted',
  );
  expect(router.replace).not.toHaveBeenCalled();
});
it('restricts tenant payment contract options to the selected tenant and preselects an active contract', async () => {
  jest
    .spyOn(tenantsApi, 'getById')
    .mockResolvedValue({ firstName: 'Ana', lastName: 'Tenant' } as never);
  jest.spyOn(leasesApi, 'getAll').mockResolvedValue([
    { id: 'other', tenantId: 'different-tenant', status: 'ACTIVE' },
    { id: 'selected-lease', tenantId: 'selected-id', status: 'ACTIVE' },
    { id: 'finished', tenantId: 'selected-id', status: 'FINALIZED' },
  ] as never);
  jest
    .spyOn(tenantAccountsApi, 'getByLease')
    .mockResolvedValue({ id: 'account-1' } as never);
  const create = jest.spyOn(paymentsApi, 'create').mockResolvedValue(payment);
  const app = await renderApp(<NewTenantPayment />);
  expect(textContent(app)).not.toContain('tenantPaymentCreate.leaseId.other');
  await input(app, 'tenantPaymentCreate.amount', '75.25');
  await press(app, 'tenantPaymentCreate.submit');
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 75.25, tenantAccountId: 'account-1' }),
  );
});
it('keeps the external settlement payment feature disabled without requesting or mutating funds', async () => {
  const settlements = jest.spyOn(ownersApi, 'getSettlements');
  const pay = jest.spyOn(ownersApi, 'registerSettlementPayment');
  const app = await renderApp(<OwnerPayment />);
  expect(textContent(app)).toContain('properties.externalSettlementsDisabled');
  expect(settlements).not.toHaveBeenCalled();
  expect(pay).not.toHaveBeenCalled();
});
it('confirms only a pending payment and refetches the server receipt state', async () => {
  const fetch = jest
    .spyOn(paymentsApi, 'getById')
    .mockResolvedValueOnce(payment)
    .mockResolvedValue({ ...payment, status: 'completed' });
  const confirm = jest
    .spyOn(paymentsApi, 'confirm')
    .mockResolvedValue({ ...payment, status: 'completed' });
  const app = await renderApp(<PaymentDetail />);
  await press(app, 'paymentDetail.confirm');
  expect(confirm).toHaveBeenCalledWith('selected-id');
  expect(fetch.mock.calls.length).toBeGreaterThan(1);
  expect(textContent(app)).toContain('payments.receiptPreparingDescription');
  expect(
    app.root.findAll((node) => node.props.testID === 'paymentDetail.confirm'),
  ).toHaveLength(0);
});
it('keeps pending payment confirmation available after a rejected operation', async () => {
  jest.spyOn(paymentsApi, 'getById').mockResolvedValue(payment);
  jest
    .spyOn(paymentsApi, 'confirm')
    .mockRejectedValue(new Error('Allocation conflict'));
  const app = await renderApp(<PaymentDetail />);
  await press(app, 'paymentDetail.confirm');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'Allocation conflict',
  );
  expect(
    control(app, 'paymentDetail.confirm').props.accessibilityState.busy,
  ).toBe(false);
});
it.each([
  'annual',
  'adjustment',
  'late_fee',
  'extraordinary',
  'monthly',
] as const)(
  'displays %s payment context and downloads a prepared receipt',
  async (activityType) => {
    jest.spyOn(paymentsApi, 'getById').mockResolvedValue({
      ...payment,
      activityType,
      status: 'completed',
      receipt: { pdfUrl: 'db://receipt/pdf' },
    } as never);
    const download = jest
      .spyOn(paymentsApi, 'downloadReceiptPdf')
      .mockResolvedValue(undefined);
    const app = await renderApp(<PaymentDetail />);
    expect(textContent(app)).toContain('USD 125.5');
    await press(app, 'paymentDetail.downloadReceipt');
    expect(download).toHaveBeenCalledWith('selected-id');
  },
);
it('reports receipt-download failures instead of sharing an error document', async () => {
  jest.spyOn(paymentsApi, 'getById').mockResolvedValue({
    ...payment,
    status: 'completed',
    receipt: { pdfUrl: 'db://receipt/pdf' },
  } as never);
  jest
    .spyOn(paymentsApi, 'downloadReceiptPdf')
    .mockRejectedValue(new Error('PDF unavailable'));
  const app = await renderApp(<PaymentDetail />);
  await press(app, 'paymentDetail.downloadReceipt');
  expect(Alert.alert).toHaveBeenCalledWith('common.error', 'PDF unavailable');
});
it('shows partial invoice totals and server-recorded paid amounts and downloads its selected PDF', async () => {
  jest.spyOn(invoicesApi, 'getById').mockResolvedValue({
    id: 'selected-id',
    invoiceNumber: 'INV-002',
    currencyCode: 'USD',
    total: 1000,
    amountPaid: 350,
    status: 'partial',
    dueDate: '2026-10-05',
  } as never);
  const download = jest
    .spyOn(invoicesApi, 'downloadPdf')
    .mockResolvedValue(undefined);
  const app = await renderApp(<InvoiceDetail />);
  expect(textContent(app)).toContain('USD 1000');
  expect(textContent(app)).toContain('350');
  expect(textContent(app)).toContain('partial');
  await press(app, 'invoiceDetail.downloadPdf');
  expect(download).toHaveBeenCalledWith('selected-id');
});
it('reports invoice-download rejection and preserves its displayed data', async () => {
  jest.spyOn(invoicesApi, 'getById').mockResolvedValue({
    id: 'selected-id',
    invoiceNumber: 'INV-002',
    currencyCode: 'ARS',
    total: 100,
    amountPaid: 0,
    status: 'pending',
  } as never);
  jest.spyOn(invoicesApi, 'downloadPdf').mockRejectedValue('offline');
  const app = await renderApp(<InvoiceDetail />);
  await press(app, 'invoiceDetail.downloadPdf');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.loadError',
  );
  expect(textContent(app)).toContain('INV-002');
});
it('shows canonical sale balances and overdue amounts and fetches subsequent installment pages', async () => {
  jest.spyOn(salesApi, 'getAgreement').mockResolvedValue({
    id: 'selected-id',
    buyerName: 'Buyer One',
    currency: 'USD',
    totalAmount: 1000,
  } as never);
  const schedule = jest
    .spyOn(salesApi, 'getSchedule')
    .mockImplementation(async (_id, page = 1) => ({
      page,
      limit: 20,
      total: 41,
      asOf: '2026-10-01',
      currency: 'USD',
      totalAmount: 1000,
      paidAmount: 250,
      balance: 750,
      credit: 0,
      overdueAmount: 125,
      data: [
        {
          installmentNumber: page,
          amount: 500,
          paidAmount: 250,
          balance: 250,
          status: 'partial',
          currency: 'USD',
          dueDate: '2026-10-05',
        },
      ],
    }));
  jest.spyOn(salesApi, 'getReceipts').mockResolvedValue([
    {
      id: 'receipt-1',
      receiptNumber: 'SALE-001',
      currency: 'USD',
      amount: 250,
      paymentDate: '2026-09-30',
    } as never,
  ]);
  const download = jest
    .spyOn(salesApi, 'downloadReceipt')
    .mockResolvedValue(undefined);
  const app = await renderApp(<SaleDetail />);
  expect(textContent(app)).toContain('750');
  expect(textContent(app)).toContain('125');
  expect(textContent(app)).toContain('partial');
  await click(app, 'pagination.next');
  expect(schedule).toHaveBeenLastCalledWith('selected-id', 2);
  await click(app, 'channels.downloadReceipt');
  expect(download).toHaveBeenCalledWith('receipt-1');
});
it('keeps sale query failure visible and retries all dependent information', async () => {
  const agreement = jest
    .spyOn(salesApi, 'getAgreement')
    .mockRejectedValueOnce(new Error('Sale forbidden'))
    .mockResolvedValue({
      id: 'selected-id',
      buyerName: 'Buyer One',
      currency: 'USD',
      totalAmount: 1000,
    } as never);
  jest.spyOn(salesApi, 'getSchedule').mockResolvedValue({
    page: 1,
    limit: 20,
    total: 0,
    currency: 'USD',
    balance: 750,
    overdueAmount: 125,
    asOf: '2026-10-01',
    data: [],
  } as never);
  jest.spyOn(salesApi, 'getReceipts').mockResolvedValue([]);
  const app = await renderApp(<SaleDetail />);
  expect(textContent(app)).toContain('Sale forbidden');
  await click(app, 'common.retry');
  expect(agreement).toHaveBeenCalledTimes(2);
  expect(textContent(app)).toContain('Buyer One');
});
it.each([new Error('Receipt forbidden'), 'offline'])(
  'reports a sale receipt failure and restores the download action',
  async (error) => {
    jest
      .spyOn(salesApi, 'getAgreement')
      .mockResolvedValue({ buyerName: 'Buyer' } as never);
    jest
      .spyOn(salesApi, 'getSchedule')
      .mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 } as never);
    jest
      .spyOn(salesApi, 'getReceipts')
      .mockResolvedValue([{ id: 'r1' } as never]);
    jest.spyOn(salesApi, 'downloadReceipt').mockRejectedValue(error);
    const app = await renderApp(<SaleDetail />);
    await click(app, 'channels.downloadReceipt');
    expect(Alert.alert).toHaveBeenCalledWith(
      'common.error',
      error instanceof Error ? error.message : 'channels.openError',
    );
    expect(
      button(app, 'channels.downloadReceipt').props.accessibilityState.busy,
    ).toBe(false);
  },
);
