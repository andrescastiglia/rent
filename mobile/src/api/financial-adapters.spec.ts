import * as SecureStore from 'expo-secure-store';
import * as env from './env';
import { ApiError, apiClient } from './client';
import {
  paymentsApi,
  invoicesApi,
  tenantAccountsApi,
  paymentDocumentTemplatesApi as documents,
} from './payments';
import { leasesApi } from './leases';
import { ownersApi } from './owners';
import { salesApi } from './sales';
import { downloadAndSharePdf, createAndShareMockPdf } from './pdf';
import type { CreateLeaseInput } from '@/types/lease';
jest.mock('./env', () => ({
  __esModule: true,
  IS_MOCK_MODE: false,
  API_URL: 'https://rent.example/api',
}));
jest.mock('./pdf', () => ({
  downloadAndSharePdf: jest.fn(),
  createAndShareMockPdf: jest.fn(),
}));
const now = '2026-01-01T00:00:00.000Z';
const rawLease = {
  id: 'lease',
  propertyId: 'property',
  tenantId: 'tenant',
  buyerId: 'buyer',
  ownerId: 'owner',
  contractType: 'rental',
  monthlyRent: '12345.67',
  securityDeposit: '12000',
  fiscalValue: '10000',
  currency: 'USD',
  status: 'active',
  signatureStatus: 'signed',
  startDate: now,
  endDate: now,
  paymentFrequency: 'quarterly',
  paymentDueDay: 3,
  billingFrequency: 'custom',
  billingDay: 7,
  autoGenerateInvoices: false,
  lateFeeType: 'percentage',
  lateFeeValue: '2.5',
  lateFeeMax: '100',
  lateFeeGraceDays: 5,
  adjustmentType: 'percentage',
  adjustmentValue: '10',
  adjustmentFrequencyMonths: 3,
  inflationIndexType: 'icl',
  nextAdjustmentDate: '2026-04-01',
  lastAdjustmentDate: '2026-01-01',
  previousLeaseId: 'previous',
  versionNumber: 2,
  renewalAlertEnabled: false,
  renewalAlertPeriodicity: 'custom',
  renewalAlertCustomDays: 20,
  renewalAlertLastSentAt: now,
  termsAndConditions: 'Agreed',
  draftContractText: 'Draft',
  draftContractFormat: 'html',
  confirmedContractText: 'Confirmed',
  confirmedContractFormat: 'html',
  confirmedAt: now,
  templateId: 'template',
  templateName: 'Rental',
  buyer: {
    id: 'buyer',
    userId: 'buyer-user',
    companyId: 'company',
    interestedProfileId: 'interested',
    dni: '12345678',
    notes: 'Notes',
    user: {
      firstName: 'Ana',
      lastName: 'Buyer',
      email: 'buyer@example.com',
      phone: '+5411',
    },
  },
  documents: ['db://document'],
  createdAt: now,
  updatedAt: now,
};
const input: CreateLeaseInput = {
  companyId: 'company',
  propertyId: 'property',
  tenantId: 'tenant',
  ownerId: 'owner',
  contractType: 'rental',
  rentAmount: 12345.67,
  depositAmount: 12000,
  currency: 'USD',
  status: 'DRAFT',
  terms: 'Agreed',
  billingDay: 7,
  autoGenerateInvoices: false,
  lateFeeValue: 2.5,
  documents: ['db://document'],
};
beforeEach(() => {
  jest.spyOn(apiClient, 'get');
  jest.spyOn(apiClient, 'post').mockResolvedValue({});
  jest.spyOn(apiClient, 'patch').mockResolvedValue({});
  jest.spyOn(apiClient, 'delete').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
it('retains decimal economic terms, disabled billing policies, signatures and historical revisions', async () => {
  jest.mocked(apiClient.get).mockResolvedValue(rawLease);
  expect(await leasesApi.getById('lease')).toEqual(
    expect.objectContaining({
      rentAmount: 12345.67,
      fiscalValue: 10000,
      depositAmount: 12000,
      status: 'ACTIVE',
      signatureStatus: 'SIGNED',
      paymentFrequency: 'quarterly',
      billingDay: 7,
      autoGenerateInvoices: false,
      lateFeeValue: 2.5,
      lateFeeMax: 100,
      adjustmentValue: 10,
      nextAdjustmentDate: '2026-04-01',
      previousLeaseId: 'previous',
      versionNumber: 2,
      documents: ['db://document'],
      buyer: expect.objectContaining({ firstName: 'Ana' }),
    }),
  );
});
it.each(['active', 'finalized', null])(
  'normalizes contract status %s and optional relations',
  async (status) => {
    jest.mocked(apiClient.get).mockResolvedValue({
      id: 'lease',
      ownerId: 'owner',
      status,
      buyer: { id: 'buyer' },
    });
    const lease = await leasesApi.getById('lease');
    expect(lease?.status).toBe(
      status === 'active'
        ? 'ACTIVE'
        : status === 'finalized'
          ? 'FINALIZED'
          : 'DRAFT',
    );
    expect(lease?.buyer?.email).toBeNull();
    expect(lease?.rentAmount).toBeUndefined();
    expect(lease?.documents).toEqual([]);
  },
);
it('does not inject creation defaults or unaccepted fields when partially updating a contract', async () => {
  jest.mocked(apiClient.post).mockResolvedValue(rawLease);
  jest.mocked(apiClient.patch).mockResolvedValue(rawLease);
  await leasesApi.create(input);
  const body = jest.mocked(apiClient.post).mock.calls[0][1];
  expect(body).toEqual(
    expect.objectContaining({
      companyId: 'company',
      monthlyRent: 12345.67,
      securityDeposit: 12000,
      billingDay: 7,
      autoGenerateInvoices: false,
    }),
  );
  expect(body).not.toHaveProperty('status');
  expect(body).not.toHaveProperty('documents');
  await leasesApi.update('lease', {
    lateFeeValue: 0,
    renewalAlertEnabled: false,
  });
  expect(
    JSON.parse(JSON.stringify(jest.mocked(apiClient.patch).mock.calls[0][1])),
  ).toEqual({ lateFeeValue: 0, renewalAlertEnabled: false });
});
it('exhausts selectors and preserves server filters on the next contract page', async () => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({ data: [rawLease], total: 2, limit: 1, page: 1 })
    .mockResolvedValueOnce({
      data: [{ ...rawLease, id: 'second' }],
      total: 2,
      limit: 1,
      page: 2,
    });
  expect(
    await leasesApi.getAllWithFilters({
      status: 'FINALIZED',
      contractType: 'sale',
      includeFinalized: true,
    }),
  ).toHaveLength(2);
  const path = String(jest.mocked(apiClient.get).mock.calls[1][0]);
  for (const value of [
    'includeFinalized=true',
    'status=finalized',
    'contractType=sale',
    'page=2',
  ])
    expect(path).toContain(value);
  jest.mocked(apiClient.get).mockResolvedValue([]);
  expect(await leasesApi.getAll()).toEqual([]);
  await leasesApi.getAllWithFilters({ includeFinalized: false });
});
it.each([leasesApi, paymentsApi, invoicesApi, ownersApi])(
  'distinguishes missing financial records from authorization and transport failures',
  async (api) => {
    jest
      .mocked(apiClient.get)
      .mockRejectedValueOnce(new ApiError('Missing', 404));
    expect(await api.getById('missing')).toBeNull();
    for (const error of [
      new ApiError('Forbidden', 403),
      new Error('Offline'),
    ]) {
      jest.mocked(apiClient.get).mockRejectedValueOnce(error);
      await expect(api.getById('resource')).rejects.toBe(error);
    }
  },
);
it('preserves payment/invoice decimals, absent fields and requested page/filter metadata', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    data: [
      {
        id: 'payment',
        amount: '100.25',
        notes: 'Paid',
        reference: 'ref',
        activityType: 'extraordinary',
      },
    ],
    page: 2,
    limit: 20,
    total: 21,
  });
  const payments = await paymentsApi.getAllWithFilters({
    search: 'A & B',
    tenantId: 'tenant',
    tenantAccountId: 'account',
    leaseId: 'lease',
    propertyId: 'property',
    status: 'completed',
    method: 'cash',
    activityType: 'monthly',
    fromDate: '2026-01-01',
    toDate: '2026-02-01',
    page: 2,
    limit: 20,
  });
  expect(payments).toEqual(
    expect.objectContaining({
      total: 21,
      page: 2,
      data: [expect.objectContaining({ amount: 100.25, notes: 'Paid' })],
    }),
  );
  expect(apiClient.get).toHaveBeenCalledWith(
    expect.stringContaining('search=A+%26+B'),
  );
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ data: [{ id: 'minimal', amount: '0' }], total: 1 });
  expect((await paymentsApi.getAll()).data[0]).toEqual(
    expect.objectContaining({
      activityType: 'monthly',
      reference: null,
      notes: null,
    }),
  );
  jest.mocked(apiClient.get).mockResolvedValue({
    data: [
      {
        id: 'invoice',
        subtotal: '100',
        lateFee: '2',
        adjustments: '-1',
        total: '101',
        amountPaid: '50',
        notes: 'Partial',
      },
      { id: 'empty' },
    ],
    page: 2,
    limit: 20,
    total: 22,
  });
  const invoices = await invoicesApi.getAll({
    search: 'INV',
    status: 'partial',
    leaseId: 'lease',
    ownerId: 'owner',
    page: 2,
    limit: 20,
  });
  expect(invoices.data[0]).toEqual(
    expect.objectContaining({ total: 101, amountPaid: 50, adjustments: -1 }),
  );
  expect(invoices.data[1]).toEqual(
    expect.objectContaining({ total: 0, amountPaid: 0, notes: null }),
  );
  await invoicesApi.getAll();
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'p', amount: '5' });
  expect((await paymentsApi.getById('p'))?.amount).toBe(5);
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'i', total: '5' });
  expect((await invoicesApi.getById('i'))?.total).toBe(5);
});
it('attaches persistent idempotency keys to payment creation/confirmation and routes authorized downloads', async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue(
      'header.' +
        Buffer.from(
          JSON.stringify({ sub: 'user', companyId: 'company' }),
        ).toString('base64') +
        '.signature',
    );
  jest
    .spyOn(SecureStore, 'getItemAsync')
    .mockImplementation(async (key) =>
      key === 'rent.auth.token'
        ? 'header.' +
          Buffer.from(
            JSON.stringify({ sub: 'user', companyId: 'company' }),
          ).toString('base64') +
          '.signature'
        : null,
    );
  jest
    .mocked(apiClient.post)
    .mockResolvedValue({ id: 'payment', amount: '10' });
  jest
    .mocked(apiClient.patch)
    .mockResolvedValue({ id: 'payment', amount: '10', status: 'completed' });
  const payload = {
    tenantAccountId: 'account',
    amount: 10,
    paymentDate: '2026-01-01',
    method: 'cash' as const,
  };
  expect((await paymentsApi.create(payload)).amount).toBe(10);
  expect(apiClient.post).toHaveBeenCalledWith('/payments', payload, undefined, {
    'Idempotency-Key': expect.any(String),
  });
  expect((await paymentsApi.confirm('payment')).status).toBe('completed');
  expect(apiClient.patch).toHaveBeenCalledWith(
    '/payments/payment/confirm',
    {},
    undefined,
    { 'Idempotency-Key': expect.any(String) },
  );
  await paymentsApi.downloadReceiptPdf('payment');
  await invoicesApi.downloadPdf('invoice');
  await leasesApi.downloadContract('lease');
  await ownersApi.downloadSettlementReceipt('owner', 'settlement');
  await salesApi.downloadReceipt('sale');
  expect(downloadAndSharePdf).toHaveBeenCalledTimes(5);
});
it('reads owner summaries per currency and retains identities without access, banking and tax profiles', async () => {
  const raw = {
    id: 'owner',
    userId: 'user',
    companyId: 'company',
    user: {
      firstName: 'Ana',
      lastName: 'Owner',
      email: 'owner@example.com',
      phone: '+5411',
    },
    taxId: 'CUIT',
    taxIdType: 'CUIT',
    address: 'Address',
    city: 'City',
    state: 'State',
    country: 'AR',
    postalCode: '1000',
    bankName: 'Bank',
    bankAccountType: 'checking',
    bankAccountNumber: '1234',
    bankCbu: 'CBU',
    bankAlias: 'alias',
    paymentMethod: 'bank_transfer',
    commissionRate: 7,
    notes: 'Notes',
    createdAt: now,
    updatedAt: now,
  };
  jest.mocked(apiClient.get).mockResolvedValue(raw);
  expect(await ownersApi.getById('owner')).toEqual(
    expect.objectContaining({
      firstName: 'Ana',
      commissionRate: 7,
      bankAlias: 'alias',
    }),
  );
  await ownersApi.getMyProfile();
  expect(apiClient.get).toHaveBeenLastCalledWith('/owners/me');
  jest.mocked(apiClient.get).mockResolvedValue({
    collectionsByCurrency: [
      { currencyCode: 'ARS', amount: '100.25' },
      { currencyCode: 'USD', amount: '20.00' },
    ],
  });
  expect((await ownersApi.getMySummary()).collectionsByCurrency).toHaveLength(
    2,
  );
  jest.mocked(apiClient.get).mockResolvedValue([{ id: 'without-user' }]);
  expect(await ownersApi.getAll()).toEqual([
    expect.objectContaining({ id: 'without-user', userId: '', firstName: '' }),
  ]);
  jest.mocked(apiClient.post).mockResolvedValue(raw);
  jest
    .mocked(apiClient.patch)
    .mockResolvedValue({ id: 'owner', firstName: 'Direct' });
  expect(
    (
      await ownersApi.create({
        firstName: 'Ana',
        lastName: 'Owner',
        email: 'owner@example.com',
      })
    ).id,
  ).toBe('owner');
  expect(
    (await ownersApi.update('owner', { firstName: 'Direct' })).firstName,
  ).toBe('Direct');
  jest.mocked(apiClient.get).mockResolvedValue([]);
  await ownersApi.getSettlements('owner');
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/owners/owner/settlements?status=all&limit=6',
  );
  await ownersApi.getSettlements('owner', 'failed', 20);
  await ownersApi.registerSettlementPayment('owner', 'settlement', {
    amount: 50,
  });
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/owners/owner/settlements/settlement/pay',
    { amount: 50 },
  );
});
it('refuses to fabricate a missing tenant account and propagates access failures', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'account', balance: -10 });
  expect((await tenantAccountsApi.getByLease('lease'))?.balance).toBe(-10);
  jest
    .mocked(apiClient.get)
    .mockRejectedValueOnce(new ApiError('Missing', 404));
  expect(await tenantAccountsApi.getByLease('lease')).toBeNull();
  jest
    .mocked(apiClient.get)
    .mockRejectedValueOnce(new ApiError('Forbidden', 403));
  await expect(tenantAccountsApi.getByLease('lease')).rejects.toThrow(
    'Forbidden',
  );
});
it('uses the requested record, text format and document template type on the wire', async () => {
  jest.mocked(apiClient.post).mockResolvedValue(rawLease);
  jest.mocked(apiClient.patch).mockResolvedValue(rawLease);
  await leasesApi.renderDraft('lease', 'template');
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/contracts/lease/draft/render',
    { templateId: 'template' },
  );
  await leasesApi.updateDraftText('lease', '<p>Agreed</p>', 'html');
  expect(apiClient.patch).toHaveBeenLastCalledWith(
    '/contracts/lease/draft-text',
    { draftText: '<p>Agreed</p>', draftFormat: 'html' },
  );
  await leasesApi.confirmDraft('lease', 'Agreed');
  expect(apiClient.post).toHaveBeenLastCalledWith('/contracts/lease/confirm', {
    finalText: 'Agreed',
    finalFormat: 'plain_text',
  });
  await leasesApi.delete('lease');
  jest.mocked(apiClient.get).mockResolvedValue([
    {
      id: 'template',
      name: 'Name',
      contractType: 'sale',
      templateBody: 'Terms',
      isActive: true,
    },
  ]);
  expect((await leasesApi.getTemplates('sale'))[0].templateFormat).toBe(
    'plain_text',
  );
  await leasesApi.getTemplates();
  jest.mocked(apiClient.post).mockResolvedValue({
    id: 'template',
    name: 'Name',
    contractType: 'rental',
    templateBody: 'Terms',
    isActive: true,
    templateFormat: 'html',
  });
  expect(
    (
      await leasesApi.createTemplate({
        name: 'Name',
        contractType: 'rental',
        templateBody: 'Terms',
      })
    ).templateFormat,
  ).toBe('html');
  jest.mocked(apiClient.patch).mockResolvedValue({
    id: 'template',
    name: 'Updated',
    contractType: 'rental',
    templateBody: 'Terms',
    isActive: true,
  });
  await leasesApi.updateTemplate('template', { name: 'Updated' });
  await leasesApi.deleteTemplate('template');
  jest.mocked(apiClient.get).mockResolvedValue([]);
  await documents.list();
  await documents.list('invoice');
  await documents.create({
    type: 'invoice',
    name: 'Name',
    templateBody: 'Body',
  });
  await documents.update('template', { isActive: false });
  await documents.delete('template');
});
it('keeps sale schedule pagination, canonical balances and overpayments returned by the backend', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    id: 'agreement',
    currency: 'USD',
    balance: 50,
    credit: 25,
    page: 3,
    limit: 10,
    data: [],
  });
  await salesApi.getFolders();
  await salesApi.getAgreements();
  expect((await salesApi.getAgreement('agreement')).id).toBe('agreement');
  expect(await salesApi.getSchedule('agreement', 3, 10)).toEqual(
    expect.objectContaining({ page: 3, credit: 25 }),
  );
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/sales/agreements/agreement/schedule?page=3&limit=10',
  );
  await salesApi.getReceipts('agreement');
  await salesApi.getSchedule('agreement');
});
it('preserves server-side sale search and metadata on later pages', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    data: [{ id: 'agreement-42', buyerName: 'Buyer Martín' }],
    total: 42,
    page: 3,
    limit: 20,
  });
  expect(
    await salesApi.getAgreementsPage({
      page: 3,
      limit: 20,
      search: 'Buyer Martín',
    }),
  ).toEqual({
    data: [{ id: 'agreement-42', buyerName: 'Buyer Martín' }],
    total: 42,
    page: 3,
    limit: 20,
  });
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/sales/agreements/page?page=3&limit=20&search=Buyer+Mart%C3%ADn',
  );
});
describe('financial demonstration behavior', () => {
  beforeEach(() => jest.replaceProperty(env, 'IS_MOCK_MODE', true));
  it('creates pending payments, confirms explicit IDs and scopes invoices/accounts without remote writes', async () => {
    const p = await paymentsApi.create({
      tenantAccountId: 'ta1',
      amount: 10,
      paymentDate: '2026-01-01',
      method: 'cash',
      items: [{ description: 'Rent', amount: 10, quantity: 1, type: 'charge' }],
    });
    expect(p.status).toBe('pending');
    expect((await paymentsApi.confirm(p.id)).status).toBe('completed');
    await expect(paymentsApi.confirm('missing')).rejects.toThrow('not found');
    expect(await paymentsApi.getById(p.id)).not.toBeNull();
    expect(await paymentsApi.getById('missing')).toBeNull();
    expect((await paymentsApi.getAll()).total).toBeGreaterThan(0);
    expect(
      (
        await paymentsApi.getAllWithFilters({
          status: 'failed',
          method: 'cash',
          activityType: 'extraordinary',
          tenantId: 'missing',
          tenantAccountId: 'missing',
          leaseId: 'missing',
          propertyId: 'missing',
          fromDate: '3000-01-01',
          toDate: '1900-01-01',
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await paymentsApi.getAllWithFilters({
          status: 'completed',
          method: 'cash',
          activityType: 'monthly',
          tenantAccountId: 'ta1',
          fromDate: '2020-01-01',
          toDate: '3000-01-01',
        })
      ).total,
    ).toBeGreaterThan(0);
    expect((await invoicesApi.getAll()).total).toBe(1);
    expect(
      (
        await invoicesApi.getAll({
          status: 'paid',
          leaseId: '1',
          ownerId: 'owner-1',
        })
      ).total,
    ).toBe(1);
    for (const filters of [
      { status: 'draft' as const },
      { leaseId: 'missing' },
      { ownerId: 'missing' },
    ])
      expect((await invoicesApi.getAll(filters)).total).toBe(0);
    expect(await invoicesApi.getById('inv1')).not.toBeNull();
    expect(await invoicesApi.getById('missing')).toBeNull();
    expect((await tenantAccountsApi.getByLease('1'))?.id).toBe('ta1');
    expect((await tenantAccountsApi.getByLease('new'))?.id).toBe('ta-new');
    await paymentsApi.downloadReceiptPdf(p.id);
    await invoicesApi.downloadPdf('inv1');
    expect(createAndShareMockPdf).toHaveBeenCalledTimes(2);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it('keeps one default per document type and permits nondefault inactive templates', async () => {
    const a = await documents.create({
      type: 'credit_note',
      name: 'Credit',
      templateBody: 'Credit',
    });
    expect(a.isDefault).toBe(true);
    const b = await documents.create({
      type: 'credit_note',
      name: 'Secondary',
      templateBody: 'Credit',
      isDefault: false,
      isActive: false,
    });
    expect(b.isDefault).toBe(false);
    await documents.update(a.id, { isDefault: false });
    await documents.update(b.id, { isDefault: true });
    expect(
      (await documents.list('credit_note')).filter((item) => item.isDefault),
    ).toHaveLength(1);
    await documents.list();
    await expect(documents.update('missing', {})).rejects.toThrow('not found');
    await documents.delete(b.id);
  });
  it('retains configuration through draft generation and explicit confirmation', async () => {
    const lease = await leasesApi.create(input);
    expect((await leasesApi.getById(lease.id))?.billingDay).toBe(7);
    expect(await leasesApi.getById('missing')).toBeNull();
    expect(
      (await leasesApi.update(lease.id, { autoGenerateInvoices: true }))
        .autoGenerateInvoices,
    ).toBe(true);
    await expect(leasesApi.update('missing', {})).rejects.toThrow('not found');
    await leasesApi.getAll();
    await leasesApi.getAllWithFilters({
      includeFinalized: true,
      status: 'ACTIVE',
      contractType: 'rental',
    });
    await leasesApi.getAllWithFilters({ includeFinalized: false });
    const template = await leasesApi.createTemplate({
      name: 'Custom',
      contractType: 'rental',
      templateBody: 'Agreed',
    });
    await leasesApi.getTemplates();
    await leasesApi.getTemplates('sale');
    await leasesApi.updateTemplate(template.id, { name: 'Updated' });
    await expect(leasesApi.updateTemplate('missing', {})).rejects.toThrow(
      'not found',
    );
    await leasesApi.renderDraft(lease.id, template.id);
    await leasesApi.updateDraftText(lease.id, 'Signed');
    expect((await leasesApi.confirmDraft(lease.id)).status).toBe('ACTIVE');
    await leasesApi.confirmDraft(lease.id, 'Final', 'html');
    await leasesApi.downloadContract(lease.id);
    for (const operation of [
      () => leasesApi.renderDraft('missing'),
      () => leasesApi.updateDraftText('missing', 'Text'),
      () => leasesApi.confirmDraft('missing'),
    ])
      await expect(operation()).rejects.toThrow('not found');
    await leasesApi.deleteTemplate(template.id);
    await leasesApi.delete(lease.id);
  });
  it('refuses cross-owner settlement payments while supporting owner reads without access accounts', async () => {
    expect((await ownersApi.getMySummary()).collectionsByCurrency).toHaveLength(
      2,
    );
    await ownersApi.getMyProfile();
    await ownersApi.getAll();
    expect(await ownersApi.getById('owner-1')).not.toBeNull();
    expect(await ownersApi.getById('missing')).toBeNull();
    const owner = await ownersApi.create({
      firstName: 'Ana',
      lastName: 'Owner',
      email: 'a@example.com',
    });
    expect((await ownersApi.update(owner.id, { notes: 'Notes' })).notes).toBe(
      'Notes',
    );
    await expect(ownersApi.update('missing', {})).rejects.toThrow('not found');
    expect(await ownersApi.getSettlements('owner-1', 'all', 10)).toHaveLength(
      2,
    );
    expect(await ownersApi.getSettlements('owner-1', 'failed')).toHaveLength(0);
    await expect(
      ownersApi.registerSettlementPayment('owner-2', 'settlement-1', {}),
    ).rejects.toThrow('not found');
    expect(
      (
        await ownersApi.registerSettlementPayment('owner-1', 'settlement-2', {
          amount: 1,
          reference: 'Paid',
          notes: 'Notes',
          paymentDate: now,
        })
      ).netAmount,
    ).toBe(1);
    await ownersApi.registerSettlementPayment('owner-1', 'settlement-1', {});
    await ownersApi.downloadSettlementReceipt('owner-1', 'settlement-1');
  });
  it('offers sales reads without any financial mutation', async () => {
    expect(await salesApi.getFolders()).toHaveLength(1);
    expect(await salesApi.getAgreements()).toHaveLength(1);
    expect((await salesApi.getAgreement('agreement-1')).currency).toBe('USD');
    await expect(salesApi.getAgreement('missing')).rejects.toThrow('not found');
    expect((await salesApi.getSchedule('agreement-1')).balance).toBe(7500);
    expect(await salesApi.getReceipts('agreement-1')).toEqual([]);
    expect((await salesApi.getAgreementsPage({ search: 'Rocio' })).total).toBe(
      1,
    );
    expect(
      (await salesApi.getAgreementsPage({ search: 'missing' })).total,
    ).toBe(0);
    expect(
      (await salesApi.getAgreementsPage({ page: 2, limit: 1 })).data,
    ).toEqual([]);
    expect((await salesApi.getAgreementsPage()).total).toBe(1);
  });
});
