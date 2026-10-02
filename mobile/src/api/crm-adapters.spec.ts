import * as env from './env';
import { ApiError, apiClient } from './client';
import { interestedApi } from './interested';
import { authApi } from './auth';
import { aiApi } from './ai';
import { dashboardApi } from './dashboard';
import { whatsappApi } from './whatsapp';
import { reportsApi } from './reports';
import { currenciesApi } from './currencies';
import * as templates from './templates';
import { leasesApi } from './leases';
import { paymentDocumentTemplatesApi } from './payments';
const date = '2026-01-01T00:00:00.000Z';
jest.mock('./env', () => ({
  __esModule: true,
  IS_MOCK_MODE: false,
  API_URL: 'https://rent.example/api',
}));
beforeEach(() => {
  jest.spyOn(apiClient, 'get');
  jest.spyOn(apiClient, 'post').mockResolvedValue({});
  jest.spyOn(apiClient, 'patch').mockResolvedValue({});
  jest.spyOn(apiClient, 'delete').mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
const profile = {
  id: 'profile',
  firstName: 'Ana',
  lastName: 'Buyer',
  phone: '12345678',
  email: 'a@example.com',
  peopleCount: '2',
  minAmount: '1000.25',
  maxAmount: '2000',
  verifiedMonthlyIncome: '3000',
  hasPets: false,
  guaranteeTypes: ['insurance'],
  preferredZones: ['City'],
  preferredCity: 'City',
  desiredFeatures: ['balcony'],
  propertyTypePreference: 'house',
  operation: 'sale',
  operations: ['rent', 'sale', 'invalid'],
  status: 'buyer',
  qualificationLevel: 'sql',
  qualificationNotes: 'Verified',
  source: 'Referral',
  assignedToUserId: 'agent',
  organizationName: 'Organization',
  customFields: { field: 'value' },
  lastContactAt: date,
  nextContactAt: date,
  lostReason: 'Other',
  consentContact: false,
  consentRecordedAt: date,
  convertedToTenantId: 'tenant',
  convertedToBuyerId: 'buyer',
  convertedToSaleAgreementId: 'agreement',
  notes: 'Notes',
  createdAt: date,
  updatedAt: date,
};
const activity = {
  id: 'activity',
  interestedProfileId: 'profile',
  type: 'task',
  status: 'completed',
  subject: 'Call',
  body: 'Body',
  dueAt: date,
  completedAt: date,
  templateName: 'Follow-up',
  metadata: { propertyId: 'property' },
  createdByUserId: 'agent',
  createdAt: date,
  updatedAt: date,
};
const property = {
  id: 'property',
  name: 'Apartment',
  description: 'Description',
  propertyType: 'apartment',
  status: 'active',
  addressStreet: 'Street',
  addressNumber: '42',
  addressApartment: '3A',
  addressCity: 'City',
  addressState: 'State',
  addressPostalCode: '1000',
  addressCountry: 'AR',
  features: [{ id: 'feature', name: 'rooms', value: '2' }, {}],
  units: [
    {
      id: 'unit',
      unitNumber: 'A',
      floor: '3',
      bedrooms: '2',
      bathrooms: '1',
      area: '50',
      status: 'OCCUPIED',
      baseRent: '100',
    },
    { status: 'MAINTENANCE' },
    { rentAmount: '50' },
  ],
  images: ['image', { url: 'second' }, null],
  ownerId: 'owner',
  ownerWhatsapp: '1234',
  rentPrice: '1000',
  salePrice: '2000',
  saleCurrency: 'USD',
  operations: ['SALE', 123],
  operationState: 'sold',
  allowsPets: false,
  acceptedGuaranteeTypes: ['insurance'],
  maxOccupants: '3',
  createdAt: date,
  updatedAt: date,
};
const match = {
  id: 'match',
  interestedProfileId: 'profile',
  propertyId: 'property',
  status: 'contacted',
  score: '95',
  matchReasons: ['cityMatches'],
  contactedAt: date,
  notes: 'Notes',
  property,
  createdAt: date,
  updatedAt: date,
};
it('preserves profile qualification, consent, decimal budgets and canonical operations', async () => {
  jest.mocked(apiClient.get).mockResolvedValue(profile);
  expect(await interestedApi.getById('profile')).toEqual(
    expect.objectContaining({
      minAmount: 1000.25,
      hasPets: false,
      consentContact: false,
      operations: ['rent', 'sale'],
      convertedToSaleAgreementId: 'agreement',
    }),
  );
  jest.mocked(apiClient.get).mockResolvedValue({
    id: 'empty',
    operations: ['bad'],
    minAmount: 'invalid',
  });
  expect(await interestedApi.getById('empty')).toEqual(
    expect.objectContaining({
      phone: '',
      operations: ['rent'],
      minAmount: undefined,
      status: 'interested',
    }),
  );
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ id: 'legacy', operation: 'sale' });
  expect((await interestedApi.getById('legacy'))?.operations).toEqual(['sale']);
});
it('normalizes nested timeline, activities, suggested property units, visits and optional relations', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    profile,
    stageHistory: [
      {
        id: 'stage',
        fromStatus: 'interested',
        toStatus: 'buyer',
        reason: 'Qualified',
        changedAt: date,
        changedByUserId: 'agent',
      },
    ],
    activities: [activity, {}],
    matches: [match, {}],
    visits: [
      {
        id: 'visit',
        propertyId: 'property',
        visitedAt: date,
        interestedName: 'Ana',
        comments: 'Viewed',
        hasOffer: false,
        offerAmount: '100.25',
        offerCurrency: 'USD',
        property,
      },
      {},
    ],
  });
  const result = await interestedApi.getSummary('profile');
  expect(result.activities[0].completedAt).toBe(date);
  expect(result.matches[0]).toEqual(
    expect.objectContaining({
      score: 95,
      property: expect.objectContaining({
        type: 'APARTMENT',
        operations: ['sale'],
        units: expect.arrayContaining([
          expect.objectContaining({ status: 'OCCUPIED', rentAmount: 100 }),
        ]),
      }),
    }),
  );
  expect(result.visits[0].offerAmount).toBe(100.25);
  jest.mocked(apiClient.get).mockResolvedValue({ profile: { id: 'minimal' } });
  expect(await interestedApi.getSummary('minimal')).toEqual(
    expect.objectContaining({
      activities: [],
      matches: [],
      visits: [],
      stageHistory: [],
    }),
  );
});
it.each([
  'apartment',
  'house',
  'commercial',
  'office',
  'warehouse',
  'land',
  'parking',
  'other',
])('adapts matched property type %s and absent legacy data', async (type) => {
  jest.mocked(apiClient.get).mockResolvedValue({
    profile: { id: 'profile' },
    matches: [{ ...match, property: { id: 'property', propertyType: type } }],
  });
  expect(
    (await interestedApi.getSummary('profile')).matches[0].property?.type,
  ).toBe(type.toUpperCase());
});
it.each([
  ['active', 'ACTIVE', 'rented'],
  ['under_maintenance', 'MAINTENANCE', 'reserved'],
  ['maintenance', 'MAINTENANCE', 'available'],
  ['inactive', 'INACTIVE', 'unknown'],
])(
  'maps matched status %s and operation state %s',
  async (status, expected, operationState) => {
    jest.mocked(apiClient.get).mockResolvedValue({
      profile: { id: 'profile' },
      matches: [
        {
          ...match,
          property: {
            id: 'property',
            status,
            operationState,
            rentPrice: 0,
            salePrice: 0,
            operations: [],
          },
        },
      ],
    });
    const mapped = (await interestedApi.getSummary('profile')).matches[0]
      .property;
    expect(mapped?.status).toBe(expected);
    expect(mapped?.operations).toEqual(['rent', 'sale']);
  },
);
it('preserves all list filters and complete paginated selector data', async () => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ data: [profile], page: 2, limit: 20, total: 21 });
  const result = await interestedApi.getAllWithFilters({
    name: 'Ana',
    phone: '123',
    operation: 'sale',
    propertyTypePreference: 'house',
    status: 'buyer',
    qualificationLevel: 'sql',
    minVerifiedMonthlyIncome: 0,
    page: 2,
    limit: 20,
  });
  expect(result.page).toBe(2);
  const path = String(jest.mocked(apiClient.get).mock.calls[0][0]);
  for (const term of [
    'phone=123',
    'minVerifiedMonthlyIncome=0',
    'page=2',
    'qualificationLevel=sql',
  ])
    expect(path).toContain(term);
  await interestedApi.getAll();
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({ data: [profile], page: 1, limit: 1, total: 2 })
    .mockResolvedValueOnce({
      data: [{ id: 'second' }],
      page: 2,
      limit: 1,
      total: 2,
    });
  expect(await interestedApi.getAllProfiles()).toHaveLength(2);
});
it('propagates failures and keeps explicit IDs for profile changes, activities and conversion', async () => {
  jest
    .mocked(apiClient.get)
    .mockRejectedValueOnce(new ApiError('Missing', 404));
  expect(await interestedApi.getById('missing')).toBeNull();
  for (const error of [new ApiError('Forbidden', 403), new Error('Offline')]) {
    jest.mocked(apiClient.get).mockRejectedValueOnce(error);
    await expect(interestedApi.getById('profile')).rejects.toBe(error);
  }
  jest.mocked(apiClient.post).mockResolvedValue(profile);
  await interestedApi.create({ phone: '12345678' });
  jest.mocked(apiClient.patch).mockResolvedValue(profile);
  await interestedApi.update('profile', { notes: 'Updated' });
  jest.mocked(apiClient.post).mockResolvedValue(activity);
  expect(
    (
      await interestedApi.addActivity('profile', {
        type: 'task',
        subject: 'Call',
      })
    ).id,
  ).toBe('activity');
  jest.mocked(apiClient.patch).mockResolvedValue(match);
  await interestedApi.updateMatch('profile', 'match', 'accepted', 'Notes');
  expect(apiClient.patch).toHaveBeenLastCalledWith(
    '/interested/profile/matches/match',
    { status: 'accepted', notes: 'Notes' },
  );
  await interestedApi.convertToTenant('profile', { dni: '12345678' });
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/interested/profile/convert/tenant',
    { dni: '12345678' },
  );
  await interestedApi.delete('profile');
});
it('routes authorization, assistant conversations and review operations without silently approving proposals', async () => {
  jest.mocked(apiClient.post).mockResolvedValue({ reauthToken: 'reauth' });
  await authApi.login({ email: 'a@example.com', password: 'password123' });
  await authApi.register({
    email: 'a@example.com',
    password: 'password123',
    firstName: 'Ana',
    lastName: 'User',
    phone: '12345678',
  });
  expect(await authApi.reauthenticate('password123')).toBe('reauth');
  jest.mocked(apiClient.get).mockResolvedValue({ mode: 'READONLY', tools: [] });
  await aiApi.getToolsStatus();
  await aiApi.getConversation('conversation');
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/ai/tools/conversations/conversation',
  );
  await aiApi.respond('Review', { conversationId: 'conversation' });
  expect(apiClient.post).toHaveBeenLastCalledWith('/ai/tools/respond', {
    prompt: 'Review',
    conversationId: 'conversation',
  });
  await aiApi.respond('New');
  await dashboardApi.getStats();
  await dashboardApi.getOperationsOverview();
  await dashboardApi.getRecentActivity(10);
  await dashboardApi.getRecentActivity();
  await dashboardApi.approvePendingAction('action', 'reauth');
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/pending-actions/action/approve',
    { reauthToken: 'reauth' },
  );
  await dashboardApi.rejectPendingAction('action');
  await dashboardApi.markCommunicationRead('communication');
  await currenciesApi.getAll();
});
it('queues WhatsApp activity with its idempotent request ID and sorts honest report outcomes', async () => {
  const input = {
    requestId: 'intent',
    personType: 'interested' as const,
    personId: 'profile',
    subject: 'Follow up',
    body: 'Body',
  };
  await whatsappApi.createActivity(input);
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/whatsapp/activities',
    input,
  );
  const send = {
    to: '1234',
    text: 'Message',
    activityEntity: 'tenant' as const,
    activityId: 'activity',
    relatedEntityType: 'tenant' as const,
    relatedEntityId: 'tenant',
  };
  await whatsappApi.sendMessage(send);
  expect(apiClient.post).toHaveBeenLastCalledWith('/whatsapp/messages', send);
  jest.mocked(apiClient.get).mockResolvedValue([
    { id: 'old', createdAt: '2026-01-01', status: 'failed' },
    { id: 'recent', createdAt: '2026-02-01', status: 'partial_failure' },
  ]);
  expect((await reportsApi.getRecent()).map((row) => row.id)).toEqual([
    'recent',
    'old',
  ]);
});
it('unifies both template domains without crossing scope on updates or deletion', async () => {
  const lease = {
    id: 'lease',
    name: 'Lease',
    templateBody: 'Terms',
    contractType: 'rental' as const,
    templateFormat: 'plain_text' as const,
    isActive: true,
    createdAt: date,
    updatedAt: date,
  };
  const payment = {
    id: 'payment',
    name: 'Receipt',
    templateBody: 'Receipt',
    type: 'receipt' as const,
    isActive: true,
    isDefault: true,
    createdAt: date,
    updatedAt: date,
  };
  jest.spyOn(leasesApi, 'getTemplates').mockResolvedValue([lease]);
  jest.spyOn(paymentDocumentTemplatesApi, 'list').mockResolvedValue([payment]);
  expect(await templates.listTemplates()).toHaveLength(2);
  expect(await templates.listTemplates('lease')).toEqual([
    expect.objectContaining({ kind: 'lease' }),
  ]);
  expect(await templates.listTemplates('payment')).toEqual([
    expect.objectContaining({ kind: 'payment' }),
  ]);
  expect(await templates.getTemplate('lease', 'missing')).toBeNull();
  expect((await templates.getTemplate('payment', 'payment'))?.paymentType).toBe(
    'receipt',
  );
  const createLease = jest
    .spyOn(leasesApi, 'createTemplate')
    .mockResolvedValue(lease);
  const createPayment = jest
    .spyOn(paymentDocumentTemplatesApi, 'create')
    .mockResolvedValue(payment);
  const value = { name: 'Name', templateBody: 'Body', isActive: false };
  await templates.createTemplate({ kind: 'lease', ...value });
  expect(createLease).toHaveBeenLastCalledWith({
    ...value,
    contractType: 'rental',
  });
  await templates.createTemplate({
    kind: 'lease',
    ...value,
    contractType: 'sale',
  });
  await templates.createTemplate({ kind: 'payment', ...value });
  expect(createPayment).toHaveBeenLastCalledWith({
    ...value,
    type: 'receipt',
    isDefault: undefined,
  });
  await templates.createTemplate({
    kind: 'payment',
    ...value,
    paymentType: 'invoice',
  });
  jest.spyOn(leasesApi, 'updateTemplate').mockResolvedValue(lease);
  jest.spyOn(paymentDocumentTemplatesApi, 'update').mockResolvedValue(payment);
  await templates.updateTemplate('lease', 'lease', value);
  await templates.updateTemplate('payment', 'payment', value);
  const deleteLease = jest
    .spyOn(leasesApi, 'deleteTemplate')
    .mockResolvedValue();
  const deletePayment = jest
    .spyOn(paymentDocumentTemplatesApi, 'delete')
    .mockResolvedValue();
  await templates.deleteTemplate('lease', 'lease');
  expect(deleteLease).toHaveBeenCalledWith('lease');
  expect(deletePayment).not.toHaveBeenCalled();
  await templates.deleteTemplate('payment', 'payment');
  expect(deletePayment).toHaveBeenCalledWith('payment');
});
describe('safe CRM and assistant demonstration paths', () => {
  beforeEach(() => jest.replaceProperty(env, 'IS_MOCK_MODE', true));
  it('keeps mock signup pending, excludes passwords from login and limits assistant tools', async () => {
    const login = await authApi.login({
      email: 'admin@example.com',
      password: 'admin123',
    });
    expect(login.user).not.toHaveProperty('password');
    expect(login.accessToken).toMatch(/^mock\./);
    await expect(
      authApi.login({ email: 'admin@example.com', password: 'wrong' }),
    ).rejects.toThrow('Credenciales');
    expect(
      (
        await authApi.register({
          email: 'a@example.com',
          password: 'password123',
          firstName: 'Ana',
          lastName: 'User',
          phone: '12345678',
        })
      ).pendingApproval,
    ).toBe(true);
    expect(await authApi.reauthenticate('password')).toBe('mock-reauth-token');
    expect((await aiApi.getToolsStatus()).mode).toBe('NONE');
    expect((await aiApi.respond('Question')).outputText).toContain('Question');
    expect(
      (await aiApi.respond('Question', { conversationId: 'existing' }))
        .conversationId,
    ).toBe('existing');
    expect((await aiApi.getConversation('existing')).messages).toEqual([]);
    await dashboardApi.getStats();
    await dashboardApi.getOperationsOverview();
    expect(
      (await dashboardApi.getRecentActivity(10)).total,
    ).toBeLessThanOrEqual(10);
    await dashboardApi.getRecentActivity();
    await dashboardApi.approvePendingAction('action', 'reauth');
    await dashboardApi.rejectPendingAction('action');
    await dashboardApi.markCommunicationRead('communication');
    expect(await currenciesApi.getAll()).toHaveLength(3);
    expect(await reportsApi.getRecent()).toHaveLength(1);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it('keeps mock CRM filters, dates, conversion identity and associated cleanup coherent', async () => {
    expect((await interestedApi.getAll()).total).toBe(2);
    expect(await interestedApi.getAllProfiles()).toHaveLength(2);
    for (const filters of [
      { name: 'Lucia' },
      { name: '5555' },
      { name: 'lucia@example.com' },
      { name: 'absent' },
      { operation: 'rent' as const },
      { operation: 'sale' as const },
      { status: 'buyer' as const },
    ])
      await interestedApi.getAllWithFilters(filters);
    expect(await interestedApi.getById('missing')).toBeNull();
    const created = await interestedApi.create({
      phone: '12345678',
      firstName: 'Ana',
      consentRecordedAt: new Date(date),
      lastContactAt: new Date(date),
      nextContactAt: new Date(date),
    });
    expect((await interestedApi.getById(created.id))?.consentRecordedAt).toBe(
      date,
    );
    await interestedApi.update(created.id, {
      lastContactAt: new Date('2026-02-01'),
      nextContactAt: new Date('2026-02-01'),
      consentRecordedAt: new Date('2026-02-01'),
    });
    await interestedApi.update(created.id, { notes: 'Updated' });
    expect(
      (
        await interestedApi.addActivity(created.id, {
          type: 'task',
          subject: 'Call',
          dueAt: date,
          status: 'completed',
          propertyId: 'property',
        })
      ).metadata,
    ).toEqual({ propertyId: 'property' });
    await interestedApi.addActivity(created.id, {
      type: 'note',
      subject: 'Note',
    });
    expect((await interestedApi.getSummary('int-1')).matches).toHaveLength(2);
    await interestedApi.updateMatch('int-1', 'match-1', 'accepted', 'Notes');
    await interestedApi.updateMatch('int-1', 'match-1', 'contacted');
    expect(
      (await interestedApi.convertToTenant(created.id, {})).tenant.id,
    ).toBe(`tenant-${created.id}`);
    expect(
      (await interestedApi.convertToTenant(created.id, {})).tenant.id,
    ).toBe(`tenant-${created.id}`);
    for (const action of [
      () => interestedApi.update('missing', {}),
      () => interestedApi.getSummary('missing'),
      () => interestedApi.updateMatch('int-2', 'match-1', 'accepted'),
      () => interestedApi.convertToTenant('missing', {}),
    ])
      await expect(action()).rejects.toThrow('not found');
    await interestedApi.delete(created.id);
    expect(await interestedApi.getById(created.id)).toBeNull();
  });
  it('represents WhatsApp queued delivery separately from an actual provider send', async () => {
    const value = {
      requestId: 'intent',
      personType: 'tenant' as const,
      personId: 'tenant',
      subject: 'Task',
    };
    expect((await whatsappApi.createActivity(value)).activity).toEqual(
      expect.objectContaining({
        id: 'intent',
        body: null,
        dueAt: null,
        status: 'pending',
      }),
    );
    await whatsappApi.createActivity({ ...value, body: 'Body', dueAt: date });
    expect(
      (
        await whatsappApi.sendMessage({
          to: '123',
          text: 'Message',
          activityEntity: 'tenant',
          activityId: 'activity',
          relatedEntityType: 'tenant',
          relatedEntityId: 'tenant',
        })
      ).queued,
    ).toBe(true);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
