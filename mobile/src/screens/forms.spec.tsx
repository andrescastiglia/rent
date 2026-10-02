import { UserForm } from './user-form';
import { TenantForm } from './tenant-form';
import { TemplateForm } from './template-form';
import { InterestedForm } from './interested-form';
import { PropertyForm } from './property-form';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  textContent,
} from '../../tests/render';
import type { Tenant } from '@/types/tenant';
import type { Property } from '@/types/property';
afterEach(cleanup);

it('rejects an incomplete user and preserves required primary role during multirole editing', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <UserForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'userForm.submit');
  expect(submit).not.toHaveBeenCalled();
  for (const [field, value] of Object.entries({
    email: 'USER@EXAMPLE.COM',
    password: 'safe-password',
    firstName: 'Ana',
    lastName: 'Garcia',
  }))
    await input(app, `userForm.${field}`, value);
  await press(app, 'userForm.role.owner');
  expect(control(app, 'userForm.roles.owner').props.disabled).toBe(true);
  await press(app, 'userForm.roles.buyer');
  await press(app, 'userForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      email: 'user@example.com',
      role: 'owner',
      roles: expect.arrayContaining(['owner', 'buyer']),
    }),
  );
});
it('updates an existing user without requiring or resending a password', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <UserForm
      mode="edit"
      initial={{
        id: 'u1',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'Garcia',
        role: 'owner',
        roles: ['owner'],
      }}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await input(app, 'userForm.phone', ' +54 11 1234 ');
  await press(app, 'userForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({ phone: '+54 11 1234', roles: ['owner'] }),
  );
  expect(submit.mock.calls[0][0]).not.toHaveProperty('password');
});
it('validates tenant identity and converts optional income and credit score without offering unsupported fields', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <TenantForm submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'tenantForm.submit');
  expect(submit).not.toHaveBeenCalled();
  const values = {
    firstName: 'Ana',
    lastName: 'Garcia',
    email: 'ana@example.com',
    phone: '123456789',
    dni: '12345678',
    monthlyIncome: '125000.50',
    creditScore: '700',
    occupation: 'Engineer',
    cuil: '27123456780',
    emergencyContactName: 'Mario',
    notes: 'Contact by email',
  };
  for (const [name, value] of Object.entries(values))
    await input(app, `tenantForm.${name}`, value);
  await press(app, 'tenantForm.employmentStatus.employed');
  await press(app, 'tenantForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      monthlyIncome: 125000.5,
      creditScore: 700,
      employmentStatus: 'employed',
    }),
  );
});
it('preserves a complete tenant profile on edit', async () => {
  const submit = jest.fn();
  const tenant: Tenant = {
    id: 't1',
    firstName: 'Ana',
    lastName: 'Garcia',
    email: 'ana@example.com',
    phone: '12345678',
    dni: '12345678',
    status: 'INACTIVE',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    address: {
      street: 'Street',
      number: '42',
      city: 'City',
      state: 'State',
      zipCode: '1000',
    },
    dateOfBirth: '1990-02-03',
    nationality: 'Argentina',
    occupation: 'Engineer',
    employer: 'Employer',
    monthlyIncome: 100,
    creditScore: 700,
    cuil: '27123456780',
    emergencyContactName: 'Mario',
    emergencyContactPhone: '12345678',
    emergencyContactRelationship: 'Brother',
    notes: 'Notes',
  };
  const app = await renderApp(
    <TenantForm initial={tenant} submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'tenantForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({ dni: tenant.dni, monthlyIncome: 100 }),
  );
});
it('requires valid template content and adapts payment versus lease scope', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <TemplateForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'templateForm.submit');
  expect(submit).not.toHaveBeenCalled();
  await input(app, 'templateForm.name', 'Monthly receipt');
  await input(app, 'templateForm.templateBody', 'Receipt for {{tenantName}}');
  await press(app, 'templateForm.kind.payment');
  await press(app, 'templateForm.paymentType.credit_note');
  await press(app, 'templateForm.isActive.no');
  await press(app, 'templateForm.submit');
  expect(submit).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: 'payment',
      paymentType: 'credit_note',
      isActive: false,
    }),
  );
});
it('keeps the template type immutable when editing a sale contract template', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <TemplateForm
      mode="edit"
      initial={{
        kind: 'lease',
        name: 'Sale contract',
        templateBody: 'Sale {{propertyAddress}}',
        isActive: true,
        isDefault: true,
        contractType: 'sale',
      }}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'templateForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'lease',
      contractType: 'sale',
      isDefault: undefined,
    }),
  );
});
it('requires a prospect phone and normalizes operations and optional search preferences', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <InterestedForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'interestedForm.submit');
  expect(submit).not.toHaveBeenCalled();
  expect(textContent(app)).toContain('interested.errors.phoneRequired');
  const values = {
    phone: '+541112345678',
    firstName: ' Ana ',
    lastName: ' Garcia ',
    email: 'ana@example.com',
    peopleCount: '3',
    minAmount: '1000',
    maxAmount: '2000',
    verifiedMonthlyIncome: '12000',
    preferredCity: 'Buenos Aires',
    desiredFeatures: 'balcony, parking',
    notes: 'Notes',
  };
  for (const [name, value] of Object.entries(values))
    await input(app, `interestedForm.${name}`, value);
  await press(app, 'interestedForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      firstName: 'Ana',
      peopleCount: 3,
      desiredFeatures: ['balcony', 'parking'],
      minAmount: 1000,
      maxAmount: 2000,
      operations: ['rent'],
    }),
  );
});
it('requires owner and address on property creation and retains monetary values by operation', async () => {
  const submit = jest.fn();
  const app = await renderApp(
    <PropertyForm mode="create" submitLabel="Save" onSubmit={submit} />,
  );
  await press(app, 'propertyForm.submit');
  expect(submit).not.toHaveBeenCalled();
  for (const [name, value] of Object.entries({
    ownerId: 'owner-1',
    name: 'Central apartment',
    street: 'Street',
    number: '42',
    city: 'City',
    state: 'State',
    zipCode: '1000',
    rentPrice: '120000',
    country: 'Argentina',
  }))
    await input(app, `propertyForm.${name}`, value);
  await press(app, 'propertyForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerId: 'owner-1',
      name: 'Central apartment',
      rentPrice: 120000,
      operations: ['rent'],
    }),
  );
});
it('locks an existing property owner and preserves features, images and sale currency', async () => {
  const submit = jest.fn();
  const property: Property = {
    id: 'p1',
    name: 'Central apartment',
    type: 'APARTMENT',
    status: 'ACTIVE',
    ownerId: 'owner-1',
    features: [{ id: 'f1', name: 'bedrooms', value: '2' }],
    units: [],
    images: ['https://rent.example/a.jpg'],
    address: {
      street: 'Street',
      number: '42',
      city: 'City',
      state: 'State',
      zipCode: '1000',
      country: 'Argentina',
    },
    operations: ['sale'],
    salePrice: 100000,
    saleCurrency: 'USD',
    operationState: 'available',
    allowsPets: false,
    acceptedGuaranteeTypes: ['insurance'],
    maxOccupants: 3,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  const app = await renderApp(
    <PropertyForm
      mode="edit"
      initial={property}
      submitLabel="Save"
      onSubmit={submit}
    />,
  );
  await press(app, 'propertyForm.submit');
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      salePrice: 100000,
      saleCurrency: 'USD',
      images: property.images,
      ownerId: 'owner-1',
    }),
  );
  expect(
    app.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'propertyForm.ownerId',
    ),
  ).toHaveLength(0);
});

describe('staged property image lifecycle', () => {
  const valid: Property = {
    id: 'p1',
    name: 'Apartment',
    type: 'APARTMENT',
    status: 'ACTIVE',
    ownerId: 'owner-1',
    features: [],
    units: [],
    images: ['linked-image'],
    address: {
      street: 'Street',
      number: '42',
      city: 'City',
      state: 'State',
      zipCode: '1000',
      country: 'Argentina',
    },
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
  it('discards newly uploaded images when cancelled while preserving linked images', async () => {
    const uploads = await import('@/api/uploads');
    const pick = jest
      .spyOn(uploads, 'pickAndUploadImages')
      .mockResolvedValue([
        { url: 'new-stage', name: 'image', mimeType: 'image/jpeg' },
      ]);
    const discard = jest
      .spyOn(uploads, 'discardUploadedAssets')
      .mockResolvedValue();
    const app = await renderApp(
      <PropertyForm
        mode="edit"
        initial={valid}
        submitLabel="Save"
        onSubmit={jest.fn()}
      />,
    );
    await press(app, 'propertyForm.upload');
    expect(pick).toHaveBeenCalled();
    await cleanup();
    expect(discard).toHaveBeenCalledWith(['new-stage']);
    expect(discard).not.toHaveBeenCalledWith(['linked-image']);
    jest.restoreAllMocks();
  });
  it('discards removed staged images and sends only remaining images on success', async () => {
    const uploads = await import('@/api/uploads');
    jest
      .spyOn(uploads, 'pickAndUploadImages')
      .mockResolvedValue([
        { url: 'new-stage', name: 'image', mimeType: 'image/jpeg' },
      ]);
    const discard = jest
      .spyOn(uploads, 'discardUploadedAssets')
      .mockResolvedValue();
    const submit = jest.fn();
    const app = await renderApp(
      <PropertyForm
        mode="edit"
        initial={valid}
        submitLabel="Save"
        onSubmit={submit}
      />,
    );
    await press(app, 'propertyForm.upload');
    await press(app, 'propertyForm.image.1.remove');
    expect(discard).toHaveBeenCalledWith(['new-stage']);
    await press(app, 'propertyForm.submit');
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ images: ['linked-image'] }),
    );
    await cleanup();
    expect(
      discard.mock.calls.filter(([images]) => images.includes('new-stage')),
    ).toHaveLength(1);
    jest.restoreAllMocks();
  });
  it('retains staged images after a failed save so retry remains possible, then preserves successful linked uploads', async () => {
    const uploads = await import('@/api/uploads');
    jest
      .spyOn(uploads, 'pickAndUploadImages')
      .mockResolvedValue([
        { url: 'new-stage', name: 'image', mimeType: 'image/jpeg' },
      ]);
    const discard = jest
      .spyOn(uploads, 'discardUploadedAssets')
      .mockResolvedValue();
    const submit = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed save'))
      .mockResolvedValue(undefined);
    const app = await renderApp(
      <PropertyForm
        mode="edit"
        initial={valid}
        submitLabel="Save"
        onSubmit={submit}
      />,
    );
    await press(app, 'propertyForm.upload');
    await press(app, 'propertyForm.submit');
    expect(discard).not.toHaveBeenCalled();
    await press(app, 'propertyForm.submit');
    await cleanup();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ images: ['linked-image', 'new-stage'] }),
    );
    expect(discard.mock.calls.flat()).not.toContain('new-stage');
    jest.restoreAllMocks();
  });
  it('handles gallery failure and cancellation without losing current property content', async () => {
    const uploads = await import('@/api/uploads');
    jest
      .spyOn(uploads, 'pickAndUploadImages')
      .mockRejectedValueOnce(new Error('Gallery denied'))
      .mockResolvedValueOnce([]);
    const app = await renderApp(
      <PropertyForm
        mode="edit"
        initial={valid}
        submitLabel="Save"
        onSubmit={jest.fn()}
      />,
    );
    await press(app, 'propertyForm.upload');
    expect(app.root.findByType('Image' as never).props.source.uri).toBe(
      'linked-image',
    );
    await press(app, 'propertyForm.upload');
    expect(control(app, 'propertyForm.upload').props.disabled).toBe(false);
    jest.restoreAllMocks();
  });
});
