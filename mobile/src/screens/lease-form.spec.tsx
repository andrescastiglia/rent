import { act } from 'react-test-renderer';
import { LeaseForm } from './lease-form';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  textContent,
} from '../../tests/render';
import type { Lease } from '@/types/lease';
import { propertiesApi } from '@/api/properties';
afterEach(() => {
  jest.restoreAllMocks();
  return cleanup();
});
const initial: Lease = {
  id: 'l1',
  propertyId: '1',
  ownerId: 'owner-1',
  tenantId: '1',
  contractType: 'rental',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  rentAmount: 120000,
  depositAmount: 120000,
  fiscalValue: 100000,
  currency: 'ARS',
  documents: ['db://document/doc-1'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  paymentFrequency: 'monthly',
  paymentDueDay: 10,
  billingFrequency: 'custom',
  billingDay: 5,
  autoGenerateInvoices: true,
  renewalAlertEnabled: true,
  renewalAlertPeriodicity: 'custom',
  renewalAlertCustomDays: 30,
  lateFeeType: 'percentage',
  lateFeeValue: 2,
  lateFeeGraceDays: 5,
  lateFeeMax: 20,
  adjustmentType: 'inflation_index',
  adjustmentFrequencyMonths: 3,
  inflationIndexType: 'icl',
  nextAdjustmentDate: '2026-04-01',
  terms: 'Agreed terms',
};

it('preserves billing, renewal, adjustment and document data while editing a rental contract', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm
      mode="edit"
      initial={initial}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'leaseForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      propertyId: '1',
      ownerId: 'owner-1',
      tenantId: '1',
      rentAmount: 120000,
      documents: initial.documents,
      terms: 'Agreed terms',
      templateId: undefined,
      lateFeeType: 'percentage',
      lateFeeValue: 2,
      adjustmentType: 'inflation_index',
      inflationIndexType: 'icl',
      renewalAlertCustomDays: 30,
      billingDay: 5,
    }),
  );
});
it('blocks an incomplete new rental and preserves the user-entered amount on validation failure', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  await input(app, 'leaseForm.rentAmount', '75000');
  await press(app, 'leaseForm.submit');
  expect(submit).not.toHaveBeenCalled();
  expect(control(app, 'leaseForm.rentAmount').props.value).toBe('75000');
  expect(textContent(app)).toContain('validation.tenantRequired');
});
it('serializes a sale contract with a buyer while clearing rental-only terms', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm
      mode="edit"
      initial={{
        ...initial,
        contractType: 'sale',
        tenantId: undefined,
        buyerId: 'buyer-1',
        fiscalValue: 100000,
      }}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'leaseForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      contractType: 'sale',
      buyerId: 'buyer-1',
      fiscalValue: 100000,
    }),
  );
  expect(submit.mock.calls[0][0]).not.toHaveProperty('tenantId');
  expect(submit.mock.calls[0][0]).not.toHaveProperty('rentAmount');
});
it('date picker selection updates contract dates without shifting the day', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm
      mode="edit"
      initial={initial}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'leaseForm.startDate');
  await act(async () => {
    control(app, 'leaseForm.startDate.picker').props.onValueChange(
      {},
      new Date(2026, 8, 5),
    );
  });
  await press(app, 'leaseForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({ startDate: '2026-09-05' }),
  );
});
it('selecting no late fee clears obsolete financial policy inputs', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm
      mode="edit"
      initial={initial}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'leaseForm.lateFeeType');
  await press(app, 'leaseForm.lateFeeType.none');
  await press(app, 'leaseForm.adjustmentType');
  await press(app, 'leaseForm.adjustmentType.fixed');
  await press(app, 'leaseForm.renewalAlertEnabled');
  await press(app, 'leaseForm.renewalAlertEnabled.no');
  await press(app, 'leaseForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      lateFeeType: 'none',
      lateFeeValue: undefined,
      lateFeeGraceDays: undefined,
      inflationIndexType: undefined,
      renewalAlertEnabled: false,
      renewalAlertCustomDays: undefined,
    }),
  );
});
it('shows a recoverable selector load error rather than silently choosing a record', async () => {
  jest
    .spyOn(propertiesApi, 'getAll')
    .mockRejectedValue(new Error('Properties unavailable'));
  const submit = jest.fn();
  const app = await renderApp(
    <LeaseForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  expect(textContent(app)).toContain('common.loadError');
  expect(submit).not.toHaveBeenCalled();
});
