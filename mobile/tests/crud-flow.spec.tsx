import { createElement } from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import NewProperty from '../app/(app)/properties/new';
import EditProperty from '../app/(app)/properties/[id]/edit';
import NewTenant from '../app/(app)/tenants/new';
import EditTenant from '../app/(app)/tenants/[id]/edit';
import NewUser from '../app/(app)/users/new';
import EditUser from '../app/(app)/users/[id]/edit';
import NewInterested from '../app/(app)/interested/new';
import EditInterested from '../app/(app)/interested/[id]/edit';
import NewLease from '../app/(app)/leases/new';
import EditLease from '../app/(app)/leases/[id]/edit';
import { setAuth } from './auth-fixture';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { usersApi } from '@/api/users';
import { interestedApi } from '@/api/interested';
import { leasesApi } from '@/api/leases';
import { cleanup, renderApp, settle, textContent } from './render';

// The form's validation and serialized values are tested against real components in src/screens.
// Here the boundary is a validated form submission, resource selection, API failure and navigation.
jest.mock('@/contexts/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@/screens/property-form', () => ({
  PropertyForm: (props: object) => createElement('ValidatedForm', props),
}));
jest.mock('@/screens/tenant-form', () => ({
  TenantForm: (props: object) => createElement('ValidatedForm', props),
}));
jest.mock('@/screens/user-form', () => ({
  UserForm: (props: object) => createElement('ValidatedForm', props),
}));
jest.mock('@/screens/interested-form', () => ({
  InterestedForm: (props: object) => createElement('ValidatedForm', props),
}));
jest.mock('@/screens/lease-form', () => ({
  LeaseForm: (props: object) => createElement('ValidatedForm', props),
}));
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
beforeEach(() => {
  setAuth();
  jest.mocked(useLocalSearchParams).mockReturnValue({
    id: 'selected-id',
    ownerId: 'owner-id',
    propertyId: 'property-id',
    tenantId: 'tenant-id',
    buyerId: 'buyer-id',
    contractType: 'sale',
  });
});
const form = (app: ReactTestRenderer) =>
  app.root.findByType('ValidatedForm' as never);
const record = { id: 'selected-id' };
const cases = [
  {
    module: 'properties',
    New: NewProperty,
    Edit: EditProperty,
    get: () => jest.spyOn(propertiesApi, 'getById'),
    create: () => jest.spyOn(propertiesApi, 'create'),
    update: () => jest.spyOn(propertiesApi, 'update'),
  },
  {
    module: 'tenants',
    New: NewTenant,
    Edit: EditTenant,
    get: () => jest.spyOn(tenantsApi, 'getById'),
    create: () => jest.spyOn(tenantsApi, 'create'),
    update: () => jest.spyOn(tenantsApi, 'update'),
  },
  {
    module: 'users',
    New: NewUser,
    Edit: EditUser,
    get: () => jest.spyOn(usersApi, 'getById'),
    create: () => jest.spyOn(usersApi, 'create'),
    update: () => jest.spyOn(usersApi, 'update'),
  },
  {
    module: 'interested',
    New: NewInterested,
    Edit: EditInterested,
    get: () => jest.spyOn(interestedApi, 'getById'),
    create: () => jest.spyOn(interestedApi, 'create'),
    update: () => jest.spyOn(interestedApi, 'update'),
  },
  {
    module: 'leases',
    New: NewLease,
    Edit: EditLease,
    get: () => jest.spyOn(leasesApi, 'getById'),
    create: () => jest.spyOn(leasesApi, 'create'),
    update: () => jest.spyOn(leasesApi, 'update'),
  },
];
describe.each(cases)(
  '$module resource flow',
  ({ module, New, Edit, get, create: createRequest, update }) => {
    it('navigates to the server-created identifier only after successful creation', async () => {
      const request = createRequest();
      request.mockResolvedValue({ id: 'created-id' } as never);
      const app = await renderApp(<New />);
      const payload = { name: 'Validated values', ownerId: 'owner-id' };
      await act(async () => {
        await form(app).props.onSubmit(payload);
      });
      expect(request).toHaveBeenCalledWith(
        module === 'leases' || module === 'tenants'
          ? { ...payload, companyId: 'company-1' }
          : payload,
      );
      expect(router.replace).toHaveBeenCalledWith(
        `/(app)/${module}/created-id`,
      );
      if (module === 'properties')
        expect(form(app).props.defaultOwnerId).toBe('owner-id');
      if (module === 'leases')
        expect(form(app).props).toEqual(
          expect.objectContaining({
            defaultPropertyId: 'property-id',
            preselectedBuyerId: 'buyer-id',
            preselectedContractType: 'sale',
          }),
        );
    });
    it('preserves the form and route when saving fails, then permits retry', async () => {
      const request = createRequest();
      request
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({ id: 'retried-id' } as never);
      const app = await renderApp(<New />);
      const payload = { name: 'Keep these values' };
      await act(async () => {
        await expect(form(app).props.onSubmit(payload)).rejects.toThrow(
          'Network unavailable',
        );
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'common.error',
        'Network unavailable',
      );
      expect(router.replace).not.toHaveBeenCalled();
      expect(form(app).props.submitting).toBe(false);
      await act(async () => {
        await form(app).props.onSubmit(payload);
      });
      expect(request).toHaveBeenCalledTimes(2);
      expect(router.replace).toHaveBeenCalledWith(
        `/(app)/${module}/retried-id`,
      );
    });
    it('loads and updates the selected resource without targeting the newly returned id', async () => {
      const fetch = get();
      fetch.mockResolvedValue(record as never);
      const request = update();
      request.mockResolvedValue({ id: 'updated-id' } as never);
      const app = await renderApp(<Edit />);
      expect(fetch).toHaveBeenCalledWith('selected-id');
      expect(form(app).props.initial).toEqual(record);
      const payload = { name: 'Changed values' };
      await act(async () => {
        await form(app).props.onSubmit(payload);
      });
      expect(request).toHaveBeenCalledWith('selected-id', payload);
      expect(router.replace).toHaveBeenCalledWith(
        `/(app)/${module}/updated-id`,
      );
    });
    it('keeps an edit form on mutation errors and reports non-Error rejection safely', async () => {
      const fetch = get();
      fetch.mockResolvedValue(record as never);
      const request = update();
      request.mockRejectedValueOnce('offline');
      const app = await renderApp(<Edit />);
      await act(async () => {
        await expect(form(app).props.onSubmit({})).rejects.toBe('offline');
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        'common.error',
        module === 'users' ? 'users.errors.save' : 'messages.saveError',
      );
      expect(router.replace).not.toHaveBeenCalled();
      expect(form(app).props.initial.id).toBe('selected-id');
    });
    it('shows query failures distinctly from missing records and retries the same resource', async () => {
      const request = get();
      request
        .mockRejectedValueOnce(new Error('Forbidden request'))
        .mockResolvedValueOnce(record as never);
      const app = await renderApp(<Edit />);
      expect(textContent(app)).toContain('Forbidden request');
      expect(app.root.findAllByType('ValidatedForm' as never)).toHaveLength(0);
      const retry = app.root.findAll(
        (node) =>
          (node.type as unknown) === 'Pressable' &&
          node.props.accessibilityLabel === 'common.retry',
      )[0];
      await act(async () => {
        retry.props.onPress();
      });
      await settle();
      expect(form(app).props.initial).toEqual(record);
      expect(request).toHaveBeenCalledTimes(2);
    });
    it('does not construct an editable form for a missing resource', async () => {
      const fetch = get();
      fetch.mockResolvedValue(null);
      const app = await renderApp(<Edit />);
      expect(app.root.findAllByType('ValidatedForm' as never)).toHaveLength(0);
      expect(textContent(app)).not.toContain('common.retry');
    });
  },
);
