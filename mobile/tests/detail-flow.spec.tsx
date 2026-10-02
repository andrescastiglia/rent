import { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PropertyDetail from '../app/(app)/properties/[id]/index';
import TenantDetail from '../app/(app)/tenants/[id]/index';
import InterestedDetail from '../app/(app)/interested/[id]/index';
import UserDetail from '../app/(app)/users/[id]/index';
import ResetPassword from '../app/(app)/users/[id]/reset-password';
import LeaseDetail from '../app/(app)/leases/[id]/index';
import NewOwner from '../app/(app)/owners/new';
import EditOwner from '../app/(app)/owners/[id]/edit';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { interestedApi } from '@/api/interested';
import { usersApi } from '@/api/users';
import { ownersApi } from '@/api/owners';
import { leasesApi } from '@/api/leases';
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
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'selected-id' });
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
const property = {
  id: 'selected-id',
  name: 'Central House',
  type: 'HOUSE',
  status: 'ACTIVE',
  ownerId: 'o1',
  address: { street: 'Main', number: '123', city: 'CABA' },
  operations: ['rent', 'sale'],
  operationState: 'available',
  salePrice: 100000,
  saleCurrency: 'USD',
  rentPrice: 150000,
  units: [],
  features: [{ id: 'f1', name: 'Bedrooms', value: '2' }],
  images: [],
  createdAt: '',
  updatedAt: '',
};
const tenant = {
  id: 'selected-id',
  firstName: 'Ana',
  lastName: 'Tenant',
  email: 'ana@example.com',
  phone: '123',
  status: 'ACTIVE',
  dni: '123',
};
const owner = {
  id: 'selected-id',
  userId: 'user-1',
  companyId: 'company-1',
  firstName: 'Owner',
  lastName: 'One',
  email: 'owner@example.com',
  phone: '123',
  createdAt: '',
  updatedAt: '',
};
const lease = {
  id: 'selected-id',
  propertyId: 'p1',
  ownerId: 'o1',
  tenantId: 't1',
  property,
  tenant,
  contractType: 'rental',
  status: 'DRAFT',
  currency: 'ARS',
  rentAmount: 150000,
  depositAmount: 150000,
  fiscalValue: 100000,
  paymentFrequency: 'monthly',
  billingFrequency: 'first_of_month',
  paymentDueDay: 10,
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  draftContractText: 'Original draft',
  draftContractFormat: 'plain_text',
  documents: [],
  lateFeeType: 'percentage',
  lateFeeValue: 2,
  lateFeeGraceDays: 5,
  lateFeeMax: 20,
  adjustmentType: 'inflation_index',
  inflationIndexType: 'icl',
  adjustmentFrequencyMonths: 3,
};
async function confirmDestructive() {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  await act(async () => {
    buttons?.find((option) => option.style === 'destructive')?.onPress?.();
  });
  await settle();
}
function propertyQueries() {
  jest.spyOn(propertiesApi, 'getById').mockResolvedValue(property as never);
  jest.spyOn(propertiesApi, 'getVisits').mockResolvedValue([
    {
      id: 'v1',
      visitedAt: '2026-10-01',
      interestedName: 'Visitor',
      hasOffer: true,
      offerAmount: 99000,
      offerCurrency: 'USD',
      comments: 'Offer subject to title review',
    },
  ] as never);
  jest.spyOn(propertiesApi, 'getMaintenanceTasks').mockResolvedValue([
    {
      id: 'm1',
      scheduledAt: '2026-10-05',
      title: 'Repair heating',
      notes: 'Keep invoice',
    },
  ] as never);
  jest.spyOn(ownersApi, 'getById').mockResolvedValue(owner);
}
it('displays property, owner, visit and maintenance information and routes authorized actions', async () => {
  propertyQueries();
  const app = await renderApp(<PropertyDetail />);
  expect(textContent(app)).toContain('Central House');
  expect(textContent(app)).toContain('Owner One');
  expect(textContent(app)).toContain('Repair heating');
  expect(textContent(app)).toContain('Visitor');
  for (const [id, path] of [
    ['propertyDetail.visit', '/(app)/properties/selected-id/visits/new'],
    [
      'propertyDetail.maintenance',
      '/(app)/properties/selected-id/maintenance/new',
    ],
    ['propertyDetail.edit', '/(app)/properties/selected-id/edit'],
  ]) {
    await press(app, id);
    expect(router.push).toHaveBeenLastCalledWith(path);
  }
});
it('requires deletion confirmation and keeps property data after an API rejection', async () => {
  propertyQueries();
  const remove = jest
    .spyOn(propertiesApi, 'delete')
    .mockRejectedValueOnce(new Error('Active contract'))
    .mockResolvedValueOnce(undefined);
  const app = await renderApp(<PropertyDetail />);
  await press(app, 'propertyDetail.delete');
  expect(remove).not.toHaveBeenCalled();
  await confirmDestructive();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'common.error',
    'Active contract',
  );
  expect(router.replace).not.toHaveBeenCalled();
  await press(app, 'propertyDetail.delete');
  await confirmDestructive();
  expect(remove).toHaveBeenCalledWith('selected-id');
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/properties');
});
it('shows external property details without native write controls', async () => {
  propertyQueries();
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  const app = await renderApp(<PropertyDetail />);
  expect(textContent(app)).toContain('Central House');
  expect(textContent(app)).not.toContain('propertyDetail.edit');
  expect(textContent(app)).not.toContain('propertyDetail.maintenance');
});
it('does not show missing property text for forbidden or disconnected requests', async () => {
  jest
    .spyOn(propertiesApi, 'getById')
    .mockRejectedValue(new Error('Property forbidden'));
  jest.spyOn(propertiesApi, 'getVisits').mockResolvedValue([]);
  jest.spyOn(propertiesApi, 'getMaintenanceTasks').mockResolvedValue([]);
  const app = await renderApp(<PropertyDetail />);
  expect(textContent(app)).toContain('Property forbidden');
  expect(textContent(app)).not.toContain('properties.notFound');
});
it('displays tenant details to an owner while withholding backoffice mutations', async () => {
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  jest.spyOn(tenantsApi, 'getById').mockResolvedValue(tenant as never);
  const app = await renderApp(<TenantDetail />);
  expect(textContent(app)).toContain('Ana Tenant');
  expect(textContent(app)).not.toContain('tenantDetail.edit');
  expect(textContent(app)).not.toContain('tenantDetail.delete');
});
it('edits and deletes a tenant only after explicit confirmation', async () => {
  jest.spyOn(tenantsApi, 'getById').mockResolvedValue(tenant as never);
  const remove = jest.spyOn(tenantsApi, 'delete').mockResolvedValue(undefined);
  const app = await renderApp(<TenantDetail />);
  await press(app, 'tenantDetail.edit');
  expect(router.push).toHaveBeenCalledWith('/(app)/tenants/selected-id/edit');
  await press(app, 'tenantDetail.delete');
  expect(remove).not.toHaveBeenCalled();
  await confirmDestructive();
  expect(remove).toHaveBeenCalledWith('selected-id');
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/tenants');
});
it('reports tenant deletion failure and retains the displayed record', async () => {
  jest.spyOn(tenantsApi, 'getById').mockResolvedValue(tenant as never);
  jest.spyOn(tenantsApi, 'delete').mockRejectedValue('offline');
  const app = await renderApp(<TenantDetail />);
  await press(app, 'tenantDetail.delete');
  await confirmDestructive();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'common.error',
    'tenants.deleteError',
  );
  expect(textContent(app)).toContain('Ana Tenant');
});
it('opens prospect editing and activity registration, with explicit deletion confirmation', async () => {
  jest.spyOn(interestedApi, 'getById').mockResolvedValue({
    id: 'selected-id',
    firstName: 'Lucia',
    lastName: 'Prospect',
    phone: '123',
    operations: ['sale'],
    status: 'interested',
    qualificationLevel: 'qualified',
    minAmount: 50000,
    maxAmount: 70000,
    notes: 'Contact afternoons',
  } as never);
  const remove = jest
    .spyOn(interestedApi, 'delete')
    .mockResolvedValue(undefined);
  const app = await renderApp(<InterestedDetail />);
  await press(app, 'interestedDetail.activity.new');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/interested/selected-id/activities/new',
  );
  await press(app, 'interestedDetail.edit');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/interested/selected-id/edit',
  );
  await press(app, 'interestedDetail.delete');
  await confirmDestructive();
  expect(remove).toHaveBeenCalledWith('selected-id');
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/interested');
});
it('keeps prospect data and reports a rejected deletion', async () => {
  jest
    .spyOn(interestedApi, 'getById')
    .mockResolvedValue({ id: 'selected-id', phone: '123' } as never);
  jest
    .spyOn(interestedApi, 'delete')
    .mockRejectedValue(new Error('Prospect has contracts'));
  const app = await renderApp(<InterestedDetail />);
  await press(app, 'interestedDetail.delete');
  await confirmDestructive();
  expect(Alert.alert).toHaveBeenLastCalledWith(
    'common.error',
    'Prospect has contracts',
  );
});
it('supports administrative user routes and activation while using all assigned roles', async () => {
  jest.spyOn(usersApi, 'getById').mockResolvedValue({
    ...admin,
    id: 'selected-id',
    roles: ['owner', 'staff'],
    isActive: true,
  });
  const toggle = jest
    .spyOn(usersApi, 'setActivation')
    .mockResolvedValue({ ...admin, isActive: false });
  const app = await renderApp(<UserDetail />);
  expect(textContent(app)).toContain('auth.roles.owner, auth.roles.staff');
  await press(app, 'userDetail.edit');
  expect(router.push).toHaveBeenCalledWith('/(app)/users/selected-id/edit');
  await press(app, 'userDetail.resetPassword');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/users/selected-id/reset-password',
  );
  await press(app, 'userDetail.toggleActivation');
  expect(toggle).toHaveBeenCalledWith('selected-id', false);
});
it('shows activation failure without hiding the user', async () => {
  jest
    .spyOn(usersApi, 'getById')
    .mockResolvedValue({ ...admin, email: null, roles: [], isActive: false });
  jest.spyOn(usersApi, 'setActivation').mockRejectedValue('offline');
  const app = await renderApp(<UserDetail />);
  await press(app, 'userDetail.toggleActivation');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'users.errors.activation',
  );
  expect(textContent(app)).toContain('users.noEmail');
});
it('validates a new password, submits it once and navigates back only after acknowledging success', async () => {
  const reset = jest.spyOn(usersApi, 'resetPassword').mockResolvedValue({
    message: 'Password changed',
    temporaryPassword: 'temporary123',
  });
  const app = await renderApp(<ResetPassword />);
  expect(control(app, 'userResetPassword.newPassword').props).toMatchObject({
    secureTextEntry: true,
    autoComplete: 'off',
    textContentType: 'none',
  });
  await input(app, 'userResetPassword.newPassword', 'short');
  await press(app, 'userResetPassword.submit');
  expect(reset).not.toHaveBeenCalled();
  expect(textContent(app)).toContain('users.errors.passwordMinLength');
  await input(app, 'userResetPassword.newPassword', '  secure1234  ');
  await press(app, 'userResetPassword.submit');
  expect(reset).toHaveBeenCalledWith('selected-id', 'secure1234');
  expect(router.back).not.toHaveBeenCalled();
  await act(async () => {
    jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.[0].onPress?.();
  });
  expect(router.back).toHaveBeenCalled();
});
it('retains the entered password on rejection and permits canceling', async () => {
  jest
    .spyOn(usersApi, 'resetPassword')
    .mockRejectedValue(new Error('Password policy'));
  const app = await renderApp(<ResetPassword />);
  await input(app, 'userResetPassword.newPassword', 'secure1234');
  await press(app, 'userResetPassword.submit');
  expect(Alert.alert).toHaveBeenCalledWith('common.error', 'Password policy');
  await press(app, 'userResetPassword.cancel');
  expect(router.back).toHaveBeenCalled();
});
it('does not create an owner without a name and trims valid optional contact fields', async () => {
  const create = jest.spyOn(ownersApi, 'create').mockResolvedValue(owner);
  const app = await renderApp(<NewOwner />);
  await press(app, 'ownerCreate.submit');
  expect(create).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'validation.required',
  );
  await input(app, 'ownerCreate.firstName', ' Owner ');
  await input(app, 'ownerCreate.lastName', ' One ');
  await input(app, 'ownerCreate.phone', ' 123 ');
  await press(app, 'ownerCreate.submit');
  expect(create).toHaveBeenCalledWith({
    firstName: 'Owner',
    lastName: 'One',
    email: undefined,
    phone: '123',
  });
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/properties');
});
it('populates owner contact fields and preserves them during a failed update', async () => {
  jest.spyOn(ownersApi, 'getById').mockResolvedValue(owner);
  const update = jest
    .spyOn(ownersApi, 'update')
    .mockRejectedValueOnce(new Error('Contact forbidden'))
    .mockResolvedValueOnce(owner);
  const app = await renderApp(<EditOwner />);
  await input(app, 'ownerEdit.firstName', 'Changed');
  await press(app, 'ownerEdit.submit');
  expect(Alert.alert).toHaveBeenCalledWith('common.error', 'Contact forbidden');
  expect(router.back).not.toHaveBeenCalled();
  await press(app, 'ownerEdit.submit');
  expect(update).toHaveBeenLastCalledWith(
    'selected-id',
    expect.objectContaining({
      firstName: 'Changed',
      email: 'owner@example.com',
    }),
  );
  expect(router.back).toHaveBeenCalled();
});
it('saves and confirms an explicitly edited lease draft and routes detail actions', async () => {
  jest.spyOn(leasesApi, 'getById').mockResolvedValue(lease as never);
  const render = jest
    .spyOn(leasesApi, 'renderDraft')
    .mockResolvedValue(lease as never);
  const save = jest
    .spyOn(leasesApi, 'updateDraftText')
    .mockResolvedValue(lease as never);
  const confirm = jest
    .spyOn(leasesApi, 'confirmDraft')
    .mockResolvedValue(lease as never);
  const app = await renderApp(<LeaseDetail />);
  await press(app, 'leaseDetail.renderDraft');
  expect(render).toHaveBeenCalledWith('selected-id');
  await input(app, 'leaseDetail.draftInput', 'Reviewed contract');
  await press(app, 'leaseDetail.saveDraft');
  expect(save).toHaveBeenCalledWith(
    'selected-id',
    'Reviewed contract',
    'plain_text',
  );
  await press(app, 'leaseDetail.confirmDraft');
  expect(confirm).toHaveBeenCalledWith(
    'selected-id',
    'Reviewed contract',
    'plain_text',
  );
  await press(app, 'leaseDetail.edit');
  expect(router.push).toHaveBeenCalledWith('/(app)/leases/selected-id/edit');
});
it('allows an external tenant to read the contract without editing or confirming its draft', async () => {
  setAuth({ ...admin, role: 'tenant', roles: ['tenant'] });
  jest.spyOn(leasesApi, 'getById').mockResolvedValue({
    ...lease,
    status: 'ACTIVE',
    confirmedContractText: 'Signed terms',
    draftContractText: null,
  } as never);
  const app = await renderApp(<LeaseDetail />);
  expect(textContent(app)).toContain('Signed terms');
  expect(textContent(app)).not.toContain('leaseDetail.edit');
  expect(textContent(app)).not.toContain('leaseDetail.confirmDraft');
});
it('requires explicit confirmation before deleting a lease and reports document-download errors', async () => {
  jest.spyOn(leasesApi, 'getById').mockResolvedValue({
    ...lease,
    status: 'ACTIVE',
    confirmedContractText: 'Signed terms',
    documents: ['db://contract.pdf'],
  } as never);
  const remove = jest.spyOn(leasesApi, 'delete').mockResolvedValue(undefined);
  jest
    .spyOn(leasesApi, 'downloadContract')
    .mockRejectedValue(new Error('Missing document'));
  const app = await renderApp(<LeaseDetail />);
  await press(app, 'leaseDetail.downloadContract');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.loadError',
  );
  await press(app, 'leaseDetail.delete');
  expect(remove).not.toHaveBeenCalled();
  await confirmDestructive();
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/leases');
});
