import { act, type ReactTestRenderer } from 'react-test-renderer';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import Properties from '../app/(app)/(tabs)/properties';
import Tenants from '../app/(app)/(tabs)/tenants';
import Users from '../app/(app)/users';
import Payments from '../app/(app)/(tabs)/payments';
import Invoices from '../app/(app)/invoices';
import Interested from '../app/(app)/(tabs)/interested';
import Leases from '../app/(app)/(tabs)/leases';
import Owners from '../app/(app)/owners';
import Reports from '../app/(app)/reports';
import Sales from '../app/(app)/sales';
import Templates from '../app/(app)/templates';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { usersApi } from '@/api/users';
import { interestedApi } from '@/api/interested';
import { invoicesApi, paymentsApi } from '@/api/payments';
import { leasesApi } from '@/api/leases';
import type { Property } from '@/types/property';
import { ownersApi } from '@/api/owners';
import { reportsApi } from '@/api/reports';
import { salesApi } from '@/api/sales';
import * as templates from '@/api/templates';
import { admin, setAuth } from './auth-fixture';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  settle,
  textContent,
} from './render';

jest.mock('@/contexts/auth-context', () => ({ useAuth: jest.fn() }));
beforeEach(() => {
  setAuth();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
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
const property = {
  id: 'p1',
  name: 'Casa central',
  type: 'HOUSE',
  status: 'ACTIVE',
  ownerId: 'owner-1',
  address: {
    street: 'Central',
    number: '123',
    city: 'CABA',
    state: '',
    zipCode: '',
    country: 'AR',
  },
  units: [],
  features: [],
  images: [],
  createdAt: '',
  updatedAt: '',
} satisfies Property;
const tenant = {
  id: 't1',
  firstName: 'Ana',
  lastName: 'Tenant',
  email: 'ana@example.com',
  phone: '',
  dni: '',
  status: 'ACTIVE',
  createdAt: '',
  updatedAt: '',
} as const;
const page = <T,>(data: T[], pageNumber = 1, total = 41) => ({
  data,
  page: pageNumber,
  limit: 20,
  total,
});

it('loads server pages with the owner scope and resets pagination when property search or operation changes', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ ownerId: 'owner-1' });
  const fetch = jest
    .spyOn(propertiesApi, 'getPage')
    .mockImplementation(async (query) =>
      page(
        [{ ...property, id: `p${query?.page ?? 1}` }],
        Number(query?.page ?? 1),
      ),
    );
  const app = await renderApp(<Properties />);
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerId: 'owner-1',
      page: 1,
      limit: 20,
      order: 'newest',
    }),
  );
  await click(app, 'pagination.next');
  expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  await input(app, 'properties.search', 'another address');
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, search: 'another address' }),
  );
  await click(app, 'interested.operations.sale');
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 1, operation: 'sale' }),
  );
  await press(app, 'property.view.p1');
  expect(router.push).toHaveBeenCalledWith('/(app)/properties/p1');
  await click(app, 'common.edit');
  expect(router.push).toHaveBeenCalledWith('/(app)/properties/p1/edit');
});
it('keeps owner property navigation read-only and shows recoverable errors rather than an empty catalogue', async () => {
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  const fetch = jest
    .spyOn(propertiesApi, 'getPage')
    .mockRejectedValueOnce(new Error('Catalogue unavailable'))
    .mockResolvedValueOnce(page([property], 1, 1));
  const app = await renderApp(<Properties />);
  expect(textContent(app)).toContain('Catalogue unavailable');
  expect(textContent(app)).not.toContain('common.noDataAvailable');
  await click(app, 'common.retry');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(button(app, 'common.edit')).toBeUndefined();
});
it('shows an honest empty property result', async () => {
  jest.spyOn(propertiesApi, 'getPage').mockResolvedValue(page([], 1, 0));
  const app = await renderApp(<Properties />);
  expect(textContent(app)).toContain('common.noDataAvailable');
});
it('debounces tenant search and resets its page while retaining status labels and detail routes', async () => {
  const fetch = jest
    .spyOn(tenantsApi, 'getPage')
    .mockImplementation(async (query) =>
      page(
        [
          tenant,
          {
            ...tenant,
            id: 't2',
            firstName: '',
            lastName: '',
            email: 'fallback@example.com',
            status: 'INACTIVE',
          },
          {
            ...tenant,
            id: 't3',
            firstName: '',
            lastName: '',
            email: '',
            status: 'PROSPECT',
          },
        ],
        Number(query?.page ?? 1),
      ),
    );
  const app = await renderApp(<Tenants />);
  await click(app, 'pagination.next');
  await input(app, 'tenants.search', '  Ana  ');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 310));
  });
  await settle();
  expect(fetch).toHaveBeenLastCalledWith({ name: 'Ana', page: 1, limit: 20 });
  expect(textContent(app)).toContain('fallback@example.com');
  expect(textContent(app)).toContain('tenants.status.PROSPECT');
  for (const [id, path] of [
    ['tenants.open.t1', '/(app)/tenants/t1'],
    ['tenant.edit.t1', '/(app)/tenants/t1/edit'],
    ['tenant.payment.new.t1', '/(app)/tenants/t1/payments/new'],
    ['tenant.activity.new.t1', '/(app)/tenants/t1/activities/new'],
  ]) {
    await press(app, id);
    expect(router.push).toHaveBeenLastCalledWith(path);
  }
});
it('hides tenant mutations when management permission is not granted', async () => {
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  jest.spyOn(tenantsApi, 'getPage').mockResolvedValue(page([tenant], 1, 1));
  const app = await renderApp(<Tenants />);
  expect(textContent(app)).not.toContain('tenant.edit.t1');
  expect(textContent(app)).not.toContain('tenant.payment.new.t1');
});
it('requests server-side user search, preserves pagination metadata and routes administrative actions', async () => {
  const fetch = jest
    .spyOn(usersApi, 'list')
    .mockImplementation(async (current) =>
      page(
        [
          { ...admin, isActive: true },
          { ...admin, id: 'u2', email: null, roles: [], isActive: false },
        ],
        current,
        41,
      ),
    );
  const app = await renderApp(<Users />);
  await click(app, 'pagination.next');
  expect(fetch).toHaveBeenLastCalledWith(2, 20, '');
  const search = app.root.findAll(
    (node) => (node.type as unknown) === 'TextInput',
  )[0];
  await act(async () => {
    search.props.onChangeText('Gomez');
  });
  await settle();
  expect(fetch).toHaveBeenLastCalledWith(1, 20, 'Gomez');
  await press(app, 'users.edit.admin-1');
  expect(router.push).toHaveBeenCalledWith('/(app)/users/admin-1/edit');
  await press(app, 'users.resetPassword.admin-1');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/users/admin-1/reset-password',
  );
  expect(textContent(app)).toContain('users.noEmail');
});
it('blocks parallel user activation actions and restores them after success or rejection', async () => {
  jest
    .spyOn(usersApi, 'list')
    .mockResolvedValue(page([{ ...admin, isActive: true }], 1, 1));
  let resolve!: (user: typeof admin) => void;
  const activate = jest
    .spyOn(usersApi, 'setActivation')
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockRejectedValueOnce(new Error('Activation forbidden'));
  const app = await renderApp(<Users />);
  await press(app, 'users.toggle.admin-1');
  expect(activate).toHaveBeenCalledWith('admin-1', false);
  expect(button(app, 'users.deactivate')).toBeUndefined();
  expect(
    app.root.findAll(
      (node) =>
        (node.type as unknown) === 'Pressable' &&
        node.props.testID === 'users.resetPassword.admin-1',
    )[0].props.disabled,
  ).toBe(true);
  await act(async () => {
    resolve(admin);
  });
  await settle();
  await press(app, 'users.toggle.admin-1');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'Activation forbidden',
  );
});
it('fetches invoice pages with status and search filters and resets to the first page after changing filters', async () => {
  const fetch = jest.spyOn(invoicesApi, 'getAll').mockImplementation(
    async (query) =>
      page(
        [
          {
            id: 'i1',
            invoiceNumber: 'INV-001',
            currencyCode: 'USD',
            total: 120,
            status: 'partial',
          },
        ],
        query?.page,
      ) as never,
  );
  const app = await renderApp(<Invoices />);
  await click(app, 'pagination.next');
  expect(fetch).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  await input(app, 'invoices.search', 'INV-001');
  await press(app, 'invoices.status.partial');
  expect(fetch).toHaveBeenLastCalledWith({
    status: 'partial',
    search: 'INV-001',
    page: 1,
    limit: 20,
  });
  await press(app, 'invoices.item.i1');
  expect(router.push).toHaveBeenCalledWith('/(app)/invoices/i1');
  expect(textContent(app)).toContain('USD 120');
});
it('does not advertise no invoices when the server rejected the query', async () => {
  jest
    .spyOn(invoicesApi, 'getAll')
    .mockRejectedValue(new Error('Invoices unavailable'));
  const app = await renderApp(<Invoices />);
  expect(textContent(app)).toContain('Invoices unavailable');
  expect(textContent(app)).not.toContain('invoices.noInvoicesDescription');
});
it('passes payment filters to the server rather than searching only the current page', async () => {
  jest.spyOn(propertiesApi, 'getAll').mockResolvedValue([property]);
  jest.spyOn(leasesApi, 'getAllWithFilters').mockResolvedValue([]);
  const fetch = jest.spyOn(paymentsApi, 'getAllWithFilters').mockImplementation(
    async (query) =>
      page(
        [
          {
            id: 'pay-1',
            amount: 110,
            currencyCode: 'USD',
            status: 'completed',
            method: 'cash',
            activityType: 'monthly',
            paymentDate: '2026-10-01',
            createdAt: '',
            updatedAt: '',
          },
        ],
        query?.page,
      ) as never,
  );
  const app = await renderApp(<Payments />);
  await click(app, 'pagination.next');
  await input(app, 'payments.search', 'receipt reference');
  await press(app, 'payments.status.completed');
  await press(app, 'payments.activity.annual');
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: 'receipt reference',
      status: 'completed',
      activityType: 'annual',
      page: 1,
      limit: 20,
    }),
  );
  await act(async () => {
    control(app, 'payments.item.pay-1')
      .findAll((node) => (node.type as unknown) === 'Pressable')[0]
      .props.onPress();
  });
  expect(router.push).toHaveBeenCalledWith('/(app)/payments/pay-1');
  await press(app, 'payments.new');
  expect(router.push).toHaveBeenCalledWith('/(app)/payments/new');
});
it('keeps owner selectors scoped to the current owner and allows internal users to manage all owners', async () => {
  const owner = {
    id: 'o1',
    userId: 'user-1',
    companyId: 'company-1',
    firstName: 'Owner',
    lastName: 'One',
    email: 'owner@example.com',
    createdAt: '',
    updatedAt: '',
  };
  const all = jest.spyOn(ownersApi, 'getAll').mockResolvedValue([owner]);
  const own = jest.spyOn(ownersApi, 'getMyProfile').mockResolvedValue(owner);
  const app = await renderApp(<Owners />);
  await click(app, 'common.edit');
  expect(router.push).toHaveBeenCalledWith('/(app)/owners/o1/edit');
  await click(app, 'nav.properties');
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(app)/(tabs)/properties',
    params: { ownerId: 'o1' },
  });
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  const ownView = await renderApp(<Owners />);
  expect(own).toHaveBeenCalledTimes(1);
  expect(all).toHaveBeenCalledTimes(1);
  expect(button(ownView, 'common.edit')).toBeUndefined();
});
it('shows report failure counts, dry runs and reconciliation errors without reporting success', async () => {
  jest.spyOn(reportsApi, 'getRecent').mockResolvedValue([
    {
      id: 'r1',
      reportType: 'summary',
      status: 'partial_failure',
      ownerName: 'Owner One',
      period: '2026-09',
      recordsProcessed: 1,
      recordsTotal: 2,
      recordsFailed: 1,
      dryRun: true,
      errorMessage: 'Reconcile allocations',
      createdAt: 'invalid',
    },
    {
      id: 'r2',
      reportType: 'summary',
      status: 'success',
      recordsProcessed: 0,
      recordsTotal: 0,
      recordsFailed: 0,
      dryRun: false,
      createdAt: null,
    },
  ] as never);
  const app = await renderApp(<Reports />);
  expect(textContent(app)).toContain('reports.status.partial_failure');
  expect(textContent(app)).toContain('reports.dryRun');
  expect(textContent(app)).toContain('Reconcile allocations');
});
it('searches server sale pages and opens native detail for results beyond the first page', async () => {
  const fetch = jest
    .spyOn(salesApi, 'getAgreementsPage')
    .mockImplementation(async (query) =>
      page(
        [
          {
            id: 's1',
            buyerName: 'Buyer One',
            currency: 'USD',
            totalAmount: 1000,
            paidAmount: 150,
          } as never,
        ],
        Number(query?.page ?? 1),
      ),
    );
  const app = await renderApp(<Sales />);
  expect(fetch).toHaveBeenCalledWith({ page: 1, limit: 20, search: '' });
  await click(app, 'pagination.next');
  expect(fetch).toHaveBeenLastCalledWith({ page: 2, limit: 20, search: '' });
  await input(app, 'sales.search', 'Buyer One');
  await settle();
  expect(fetch).toHaveBeenLastCalledWith({
    page: 1,
    limit: 20,
    search: 'Buyer One',
  });
  await click(app, 'Buyer One · USD 1000');
  expect(router.push).toHaveBeenCalledWith('/(app)/sales/s1');
  expect(textContent(app)).toContain('USD');
});
it('preserves sale query errors and permits retry without claiming an empty catalogue', async () => {
  jest
    .spyOn(salesApi, 'getAgreementsPage')
    .mockRejectedValueOnce(new Error('Sales unavailable'))
    .mockResolvedValueOnce(page([], 1, 0));
  const app = await renderApp(<Sales />);
  expect(textContent(app)).toContain('Sales unavailable');
  expect(textContent(app)).not.toContain('common.noDataAvailable');
  await click(app, 'common.retry');
  expect(textContent(app)).toContain('common.noDataAvailable');
});
it('filters document templates by their actual scope and routes to the correct template kind', async () => {
  jest.spyOn(templates, 'listTemplates').mockResolvedValue([
    {
      id: 'lease-1',
      kind: 'lease',
      name: 'Lease terms',
      isActive: true,
      contractType: 'rental',
    },
    {
      id: 'receipt-1',
      kind: 'payment',
      name: 'Receipt',
      isActive: false,
      paymentType: 'receipt',
    },
  ] as never);
  const app = await renderApp(<Templates />);
  await press(app, 'templates.edit.lease.lease-1');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/templates/lease/lease-1/edit',
  );
  await press(app, 'templates.filter.paymentType.receipt');
  expect(textContent(app)).not.toContain('Lease terms');
  expect(textContent(app)).toContain('Receipt');
  await press(app, 'templates.filter.paymentType.invoice');
  expect(textContent(app)).toContain('templatesHub.empty');
});
it('requests lease filters and permits template navigation only for authorized users', async () => {
  const fetch = jest
    .spyOn(leasesApi, 'getAllWithFilters')
    .mockResolvedValue([]);
  const app = await renderApp(<Leases />);
  await input(app, 'leases.search', 'Central');
  expect(fetch).toHaveBeenCalled();
  await press(app, 'leases.templates');
  expect(router.push).toHaveBeenCalledWith('/(app)/templates');
});
it('requests interested profiles with page-aware server filters', async () => {
  const fetch = jest
    .spyOn(interestedApi, 'getAllWithFilters')
    .mockImplementation(async (query) => page([], query?.page));
  const app = await renderApp(<Interested />);
  await click(app, 'pagination.next');
  await input(app, 'interested.search', 'Lucia');
  await press(app, 'interested.filter.operation.sale');
  await press(app, 'interested.filter.status.interested');
  expect(fetch).toHaveBeenLastCalledWith(
    expect.objectContaining({
      name: 'Lucia',
      operation: 'sale',
      status: 'interested',
      page: 1,
      limit: 20,
    }),
  );
});
