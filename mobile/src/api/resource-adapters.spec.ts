import * as env from './env';
import { ApiError, apiClient } from './client';
import { propertiesApi } from './properties';
import { tenantsApi } from './tenants';
import { buyersApi } from './buyers';
import { usersApi } from './users';
import { staffApi } from './staff';
import type { CreatePropertyInput } from '@/types/property';
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
  ownerId: 'owner',
  ownerWhatsapp: '+5411',
  rentPrice: '1000.25',
  salePrice: '100000',
  saleCurrency: 'USD',
  operations: ['rent', 'sale'],
  operationState: 'reserved',
  allowsPets: false,
  acceptedGuaranteeTypes: ['insurance'],
  maxOccupants: 3,
  images: ['image'],
  features: [{ id: 'feature', name: 'rooms', value: '3' }, { name: 'terrace' }],
  createdAt: date,
  updatedAt: date,
};
const propertyInput: CreatePropertyInput = {
  name: 'Apartment',
  type: 'APARTMENT',
  ownerId: 'owner',
  address: {
    street: 'Street',
    number: '42',
    unit: '3A',
    city: 'City',
    state: 'State',
    zipCode: '1000',
    country: 'AR',
  },
  features: [{ name: 'rooms', value: '3' }],
  images: ['image'],
  operations: ['rent', 'sale'],
  rentPrice: 1000.25,
  salePrice: 100000,
  saleCurrency: 'USD',
  allowsPets: false,
  acceptedGuaranteeTypes: ['insurance'],
  maxOccupants: 3,
};
it('resolves stored property image paths to the mobile API origin', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    ...property,
    images: ['/properties/images/photo'],
  });
  expect((await propertiesApi.getById('property'))?.images).toEqual([
    'https://rent.example/api/properties/images/photo',
  ]);
});
it('retains property money, address, owner, images and suitability fields', async () => {
  jest.mocked(apiClient.get).mockResolvedValue(property);
  expect(await propertiesApi.getById('property')).toEqual(
    expect.objectContaining({
      rentPrice: 1000.25,
      salePrice: 100000,
      allowsPets: false,
      address: expect.objectContaining({ unit: '3A' }),
      features: [
        expect.objectContaining({ id: 'feature' }),
        expect.objectContaining({ name: 'terrace' }),
      ],
    }),
  );
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'empty', name: 'Empty' });
  expect(await propertiesApi.getById('empty')).toEqual(
    expect.objectContaining({
      type: 'OTHER',
      status: 'INACTIVE',
      features: [],
      images: [],
      rentPrice: undefined,
      salePrice: undefined,
      operationState: undefined,
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
])('maps property type %s consistently in reads and writes', async (type) => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ ...property, propertyType: type });
  jest
    .mocked(apiClient.post)
    .mockResolvedValue({ ...property, propertyType: type });
  const mapped = await propertiesApi.getById('property');
  await propertiesApi.create({ ...propertyInput, type: mapped!.type });
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/properties',
    expect.objectContaining({ propertyType: type }),
  );
});
it.each([
  ['active', 'ACTIVE'],
  ['under_maintenance', 'MAINTENANCE'],
  ['maintenance', 'MAINTENANCE'],
  ['inactive', 'INACTIVE'],
])(
  'maps property status %s without active defaults',
  async (status, expected) => {
    jest.mocked(apiClient.get).mockResolvedValue({ ...property, status });
    expect((await propertiesApi.getById('property'))?.status).toBe(expected);
    jest.mocked(apiClient.patch).mockResolvedValue(property);
    await propertiesApi.update('property', {
      status: expected as 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE',
    });
    expect(apiClient.patch).toHaveBeenLastCalledWith(
      '/properties/property',
      expect.objectContaining({
        status:
          expected === 'MAINTENANCE'
            ? 'under_maintenance'
            : expected.toLowerCase(),
      }),
    );
  },
);
it.each(['available', 'rented', 'reserved', 'sold'])(
  'keeps operation state %s and parses legacy operation collections',
  async (state) => {
    jest.mocked(apiClient.get).mockResolvedValue({
      ...property,
      operationState: state,
      operations: ' RENT, sale,other',
    });
    expect(await propertiesApi.getById('property')).toEqual(
      expect.objectContaining({
        operationState: state,
        operations: ['rent', 'sale'],
      }),
    );
    jest
      .mocked(apiClient.get)
      .mockResolvedValue({ ...property, operations: null });
    expect(
      (await propertiesApi.getById('property'))?.operations,
    ).toBeUndefined();
  },
);
it('preserves partial property PATCH semantics without wiping the stored address or images', async () => {
  jest.mocked(apiClient.post).mockResolvedValue(property);
  await propertiesApi.create(propertyInput);
  expect(apiClient.post).toHaveBeenCalledWith(
    '/properties',
    expect.objectContaining({
      addressApartment: '3A',
      rentPrice: 1000.25,
      allowsPets: false,
    }),
  );
  jest.mocked(apiClient.patch).mockResolvedValue(property);
  await propertiesApi.update('property', { description: 'Changed' });
  expect(
    JSON.parse(JSON.stringify(jest.mocked(apiClient.patch).mock.calls[0][1])),
  ).toEqual({ description: 'Changed' });
  await propertiesApi.update('property', {
    ...propertyInput,
    status: 'ACTIVE',
  });
  await propertiesApi.delete('property');
  expect(apiClient.delete).toHaveBeenCalledWith('/properties/property');
});
it('uses server property pages for list state and fetches every page for selectors', async () => {
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({ data: [property], total: 2, page: 1, limit: 1 })
    .mockResolvedValueOnce({
      items: [{ ...property, id: 'second' }],
      total: 2,
      page: 2,
      limit: 1,
    });
  expect(await propertiesApi.getAll()).toHaveLength(2);
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ data: [property], total: 21, page: 2, limit: 20 });
  expect(
    (
      await propertiesApi.getPage({
        page: 2,
        search: 'Street',
        operation: 'sale',
      })
    ).total,
  ).toBe(21);
  expect(apiClient.get).toHaveBeenLastCalledWith(
    expect.stringContaining('page=2'),
  );
  jest.mocked(apiClient.get).mockResolvedValue([]);
  expect((await propertiesApi.getPage()).data).toEqual([]);
});
it.each([propertiesApi, tenantsApi, buyersApi, usersApi])(
  'only converts a real 404 to missing, retaining denied and interrupted requests',
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
      await expect(api.getById('id')).rejects.toBe(error);
    }
  },
);
it('normalizes legacy visit and maintenance date aliases and page envelopes', async () => {
  const task = {
    id: 'task',
    propertyId: 'property',
    title: 'Paint',
    notes: 'Repair',
    scheduledAt: date,
    createdAt: date,
    updatedAt: date,
  };
  for (const alias of [
    'scheduledAt',
    'scheduledDate',
    'dueDate',
    'date',
    'maintenanceDate',
  ]) {
    jest.mocked(apiClient.get).mockResolvedValue({
      data: [{ [alias]: date }],
      total: 1,
      page: 1,
      limit: 1,
    });
    expect(
      (await propertiesApi.getMaintenanceTasks('property'))[0].scheduledAt,
    ).toBe(date);
  }
  jest.mocked(apiClient.get).mockResolvedValue([task, {}]);
  expect(await propertiesApi.getMaintenanceTasks('property', 2)).toHaveLength(
    2,
  );
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ items: [{}], total: 1, page: 1, limit: 1 });
  expect((await propertiesApi.getVisits('property'))[0].id).toBe(
    'visit-property-0',
  );
  jest.mocked(apiClient.get).mockResolvedValue([
    {
      id: 'visit',
      propertyId: 'property',
      visitedAt: date,
      interestedName: 'Ana',
      interestedProfileId: 'interested',
      comments: 'Viewed',
      hasOffer: false,
      offerAmount: '100.25',
      offerCurrency: 'USD',
      createdAt: date,
      updatedAt: date,
    },
  ]);
  expect((await propertiesApi.getVisits('property', 2))[0].offerAmount).toBe(
    100.25,
  );
  jest.mocked(apiClient.post).mockResolvedValue(task);
  expect(
    (await propertiesApi.createMaintenanceTask('property', { title: 'Paint' }))
      .id,
  ).toBe('task');
  jest
    .mocked(apiClient.post)
    .mockResolvedValue({ id: 'visit', visitedAt: date });
  await propertiesApi.createVisit('property', {
    interestedName: 'Ana',
    visitedAt: date,
  });
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/properties/property/visits',
    { interestedName: 'Ana', visitedAt: date },
  );
});
it('retains full tenant profile and decimals while avoiding accidental access/status and address mutations', async () => {
  const tenant = {
    id: 'tenant',
    user: {
      firstName: 'Ana',
      lastName: 'Tenant',
      email: 'tenant@example.com',
      phone: '+5411',
      isActive: false,
    },
    dni: '12345678',
    cuil: '27123456780',
    dateOfBirth: '1990-02-03',
    nationality: 'AR',
    occupation: 'Engineer',
    employer: 'Employer',
    monthlyIncome: '12345.67',
    employmentStatus: 'employed',
    emergencyContactName: 'Mario',
    emergencyContactPhone: '+5412',
    emergencyContactRelationship: 'Brother',
    creditScore: 700,
    creditScoreDate: '2026-01-01',
    notes: 'Notes',
    createdAt: date,
    updatedAt: date,
  };
  jest.mocked(apiClient.get).mockResolvedValue(tenant);
  expect(await tenantsApi.getById('tenant')).toEqual(
    expect.objectContaining({
      firstName: 'Ana',
      monthlyIncome: 12345.67,
      status: 'INACTIVE',
      dateOfBirth: '1990-02-03',
      creditScoreDate: '2026-01-01',
      emergencyContactName: 'Mario',
    }),
  );
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'empty' });
  expect(await tenantsApi.getById('empty')).toEqual(
    expect.objectContaining({
      firstName: '',
      status: 'ACTIVE',
      monthlyIncome: undefined,
    }),
  );
  jest.mocked(apiClient.post).mockResolvedValue(tenant);
  await tenantsApi.create({
    firstName: 'Ana',
    lastName: 'Tenant',
    email: 'tenant@example.com',
    phone: '+5411',
    dni: '12345678',
    status: 'ACTIVE',
    companyId: 'company',
    monthlyIncome: 12345.67,
  });
  const body = jest.mocked(apiClient.post).mock.calls[0][1];
  expect(body).not.toHaveProperty('status');
  expect(body).not.toHaveProperty('address');
  jest.mocked(apiClient.patch).mockResolvedValue(tenant);
  await tenantsApi.update('tenant', { notes: 'Changed' });
  expect(
    JSON.parse(JSON.stringify(jest.mocked(apiClient.patch).mock.calls[0][1])),
  ).toEqual({ notes: 'Changed' });
  await tenantsApi.delete('tenant');
  jest.mocked(apiClient.get).mockResolvedValue([tenant]);
  expect(
    await tenantsApi.getAll({
      name: 'Ana',
      dni: '12345678',
      email: 'tenant@example.com',
    }),
  ).toHaveLength(1);
  await tenantsApi.getAll();
  expect((await tenantsApi.getPage({ search: 'Ana' })).total).toBe(1);
  await tenantsApi.getPage();
  jest.mocked(apiClient.post).mockResolvedValue({
    id: 'activity',
    tenantId: 'tenant',
    type: 'task',
    status: 'completed',
    subject: 'Call',
    body: 'Body',
    dueAt: date,
    completedAt: date,
    metadata: { key: 'value' },
    createdAt: date,
    updatedAt: date,
  });
  expect(
    (
      await tenantsApi.createActivity('tenant', {
        type: 'task',
        subject: 'Call',
      })
    ).completedAt,
  ).toBe(date);
  jest.mocked(apiClient.post).mockResolvedValue({
    id: 'minimal',
    type: 'note',
    status: 'pending',
    subject: 'Note',
  });
  expect(
    (
      await tenantsApi.createActivity('tenant', {
        type: 'note',
        subject: 'Note',
      })
    ).body,
  ).toBeNull();
});
it('maps buyer relation fallbacks and never truncates selector profiles', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({
    id: 'buyer',
    user: {
      id: 'user',
      firstName: 'Ana',
      lastName: 'Buyer',
      email: 'buyer@example.com',
      phone: '+5411',
    },
  });
  expect(await buyersApi.getById('buyer')).toEqual(
    expect.objectContaining({ userId: 'user', firstName: 'Ana' }),
  );
  jest.mocked(apiClient.get).mockResolvedValue({});
  expect((await buyersApi.getById('unknown'))?.email).toBeNull();
  jest.mocked(apiClient.get).mockResolvedValue([
    {
      id: 'buyer',
      firstName: 'Direct',
      lastName: 'Name',
      email: 'direct@example.com',
      phone: '123',
      userId: 'user',
      companyId: 'company',
      interestedProfileId: 'interested',
      dni: '123',
      notes: 'Notes',
      createdAt: date,
      updatedAt: date,
    },
  ]);
  expect(
    await buyersApi.getAll({
      name: ' Ana ',
      email: ' buyer@example.com ',
      phone: ' 123 ',
      limit: 20,
    }),
  ).toHaveLength(1);
  await buyersApi.getAll();
});
it('routes managed-user operations with search encoding and explicit activation/password intent', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ id: 'user' });
  await usersApi.getProfile();
  await usersApi.getById('user');
  await usersApi.list();
  await usersApi.list(2, 10, 'A & B');
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/users?page=2&limit=10&search=A%20%26%20B',
  );
  jest.mocked(apiClient.post).mockResolvedValue({ id: 'user' });
  await usersApi.create({
    email: 'a@example.com',
    password: 'secure-password',
    firstName: 'Ana',
    lastName: 'User',
    role: 'staff',
  });
  await usersApi.resetPassword('user', 'replacement-password');
  expect(apiClient.post).toHaveBeenLastCalledWith(
    '/users/user/reset-password',
    { newPassword: 'replacement-password' },
  );
  await usersApi.resetPassword('user');
  jest
    .mocked(apiClient.patch)
    .mockResolvedValue({ id: 'user', isActive: false });
  await usersApi.update('user', { firstName: 'Ana' });
  await usersApi.setActivation('user', false);
  expect(apiClient.patch).toHaveBeenLastCalledWith('/users/user/activation', {
    isActive: false,
  });
  await usersApi.delete('user');
});
it('retains staff details and handles legacy array/page envelopes', async () => {
  const staff = {
    id: 'staff',
    userId: 'user',
    companyId: 'company',
    specialization: 'legal',
    hourlyRate: 25,
    currency: 'ARS',
    serviceAreas: ['City'],
    certifications: ['Cert'],
    notes: 'Notes',
    rating: 4,
    totalJobs: 10,
    createdAt: date,
    updatedAt: date,
    deletedAt: date,
    user: {
      id: 'user',
      firstName: 'Ana',
      lastName: 'Staff',
      email: 's@example.com',
      phone: '123',
      isActive: false,
    },
  };
  jest.mocked(apiClient.get).mockResolvedValue([staff]);
  expect(
    (await staffApi.getAll({ specialization: 'legal', search: 'Ana' }))[0]
      .hourlyRate,
  ).toBe(25);
  jest
    .mocked(apiClient.get)
    .mockResolvedValue({ data: [{ id: 'staff', userId: 'user' }] });
  expect((await staffApi.getAll())[0]).toEqual(
    expect.objectContaining({
      currency: 'USD',
      totalJobs: 0,
      user: expect.objectContaining({ id: 'user', isActive: true }),
    }),
  );
  jest.mocked(apiClient.get).mockResolvedValue(staff);
  await staffApi.getOne('staff');
  jest.mocked(apiClient.post).mockResolvedValue(staff);
  await staffApi.create({
    firstName: 'Ana',
    lastName: 'Staff',
    specialization: 'legal',
  });
  jest.mocked(apiClient.patch).mockResolvedValue(staff);
  await staffApi.update('staff', { notes: 'Changed' });
  await staffApi.activate('staff');
  expect(apiClient.patch).toHaveBeenLastCalledWith('/staff/staff/activate', {});
  await staffApi.remove('staff');
});
describe('resource demonstration state', () => {
  beforeEach(() => jest.replaceProperty(env, 'IS_MOCK_MODE', true));
  it('preserves edits and resource cleanup, including related visits and features', async () => {
    expect((await propertiesApi.getAll()).length).toBeGreaterThan(0);
    await propertiesApi.getPage();
    expect(
      (await propertiesApi.getPage({ search: 'no such property' })).total,
    ).toBe(0);
    expect(await propertiesApi.getById('missing')).toBeNull();
    const p = await propertiesApi.create(propertyInput);
    expect((await propertiesApi.getById(p.id))?.ownerId).toBe('owner');
    expect(
      (await propertiesApi.update(p.id, { name: 'Edited' })).features,
    ).toHaveLength(1);
    await propertiesApi.update(p.id, {
      features: [{ name: 'rooms', value: '4' }, { name: 'balcony' }],
    });
    await expect(propertiesApi.update('missing', {})).rejects.toThrow(
      'not found',
    );
    await propertiesApi.createVisit(p.id, { interestedName: 'Ana' });
    await propertiesApi.createMaintenanceTask(p.id, { title: 'Paint' });
    await propertiesApi.getVisits('1');
    await propertiesApi.getMaintenanceTasks('1');
    expect(await propertiesApi.getVisits(p.id)).toHaveLength(1);
    expect(await propertiesApi.getMaintenanceTasks(p.id)).toHaveLength(1);
    await propertiesApi.delete(p.id);
    expect(await propertiesApi.getById(p.id)).toBeNull();
    expect(await propertiesApi.getMaintenanceTasks(p.id)).toHaveLength(0);
  });
  it('retains tenant profiles and scopes mock selector searches', async () => {
    expect(await tenantsApi.getAll()).toHaveLength(1);
    expect(await tenantsApi.getAll({ name: 'Juan' })).toHaveLength(1);
    expect(await tenantsApi.getAll({ name: 'absent' })).toHaveLength(0);
    await tenantsApi.getPage();
    expect((await tenantsApi.getPage({ search: 'absent' })).total).toBe(0);
    expect(await tenantsApi.getById('missing')).toBeNull();
    const t = await tenantsApi.create({
      firstName: 'Ana',
      lastName: 'Tenant',
      email: 'a@example.com',
      phone: '12345678',
      dni: '12345678',
      status: 'INACTIVE',
    });
    expect(
      (await tenantsApi.update(t.id, { occupation: 'Engineer' })).occupation,
    ).toBe('Engineer');
    expect(await tenantsApi.getById(t.id)).not.toBeNull();
    await expect(tenantsApi.update('missing', {})).rejects.toThrow('not found');
    expect(
      (await tenantsApi.createActivity(t.id, { type: 'note', subject: 'Note' }))
        .status,
    ).toBe('pending');
    expect(
      (
        await tenantsApi.createActivity(t.id, {
          type: 'task',
          subject: 'Task',
          status: 'completed',
          body: 'Body',
          dueAt: date,
        })
      ).status,
    ).toBe('completed');
    await tenantsApi.delete(t.id);
    expect(await tenantsApi.getById(t.id)).toBeNull();
    expect(await buyersApi.getAll()).toHaveLength(1);
    expect(await buyersApi.getAll({ name: 'Rocio' })).toHaveLength(1);
    expect(await buyersApi.getAll({ name: 'absent' })).toHaveLength(0);
    expect(await buyersApi.getById('buyer-1')).not.toBeNull();
    expect(await buyersApi.getById('missing')).toBeNull();
  });
  it('normalizes user identity, keeps primary role and permits explicit deactivation/password reset', async () => {
    await usersApi.getProfile();
    await usersApi.list();
    expect((await usersApi.list(1, 1, 'absent')).total).toBe(0);
    const u = await usersApi.create({
      email: ' ANA@EXAMPLE.COM ',
      password: 'password-123',
      firstName: ' Ana ',
      lastName: ' User ',
      role: 'staff',
    });
    expect(u.email).toBe('ana@example.com');
    await usersApi.create({
      email: 'b@example.com',
      password: 'password-123',
      firstName: 'B',
      lastName: 'User',
      role: 'owner',
      roles: ['owner', 'buyer'],
      phone: '123',
    });
    expect(
      (
        await usersApi.update(u.id, {
          phone: '',
          roles: ['buyer'],
          role: 'owner',
          email: ' NEW@EXAMPLE.COM ',
          firstName: ' New ',
          lastName: ' Name ',
        })
      ).roles,
    ).toEqual(['owner', 'buyer']);
    await usersApi.update(u.id, {});
    expect((await usersApi.setActivation(u.id, false)).isActive).toBe(false);
    for (const action of [
      () => usersApi.update('missing', {}),
      () => usersApi.setActivation('missing', false),
    ])
      await expect(action()).rejects.toThrow('not found');
    expect(
      (await usersApi.resetPassword(u.id, ' explicit-password '))
        .temporaryPassword,
    ).toBe('explicit-password');
    expect((await usersApi.resetPassword(u.id)).temporaryPassword).toMatch(
      /^tmp-/,
    );
    expect(await usersApi.getById(u.id)).not.toBeNull();
    await usersApi.delete(u.id);
    expect(await usersApi.getById(u.id)).toBeNull();
  });
  it('keeps staff work history across edits, archival and reactivation', async () => {
    expect(await staffApi.getAll()).toHaveLength(1);
    expect(
      await staffApi.getAll({
        specialization: 'maintenance',
        search: 'Carlos',
      }),
    ).toHaveLength(1);
    expect(await staffApi.getAll({ search: 'absent' })).toHaveLength(0);
    expect(await staffApi.getAll({ specialization: 'legal' })).toHaveLength(0);
    await staffApi.getOne('mock-staff-1');
    await expect(staffApi.getOne('missing')).rejects.toThrow('not found');
    const s = await staffApi.create({
      firstName: 'Ana',
      lastName: 'Staff',
      specialization: 'legal',
    });
    expect(
      (
        await staffApi.update(s.id, {
          firstName: 'New',
          lastName: 'Name',
          email: 's@example.com',
          phone: '123',
          specialization: 'accounting',
          hourlyRate: 0,
          currency: 'ARS',
          serviceAreas: ['City'],
          certifications: ['Cert'],
          notes: 'Note',
        })
      ).hourlyRate,
    ).toBe(0);
    await staffApi.update(s.id, {});
    await staffApi.remove(s.id);
    expect((await staffApi.getOne(s.id)).user.isActive).toBe(false);
    expect((await staffApi.activate(s.id)).user.isActive).toBe(true);
    await staffApi.remove('missing');
    for (const action of [
      () => staffApi.update('missing', {}),
      () => staffApi.activate('missing'),
    ])
      await expect(action()).rejects.toThrow('not found');
  });
});
