import { act } from 'react-test-renderer';
import { Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import TenantActivity from '../app/(app)/tenants/[id]/activities/new';
import InterestedActivity from '../app/(app)/interested/[id]/activities/new';
import Visit from '../app/(app)/properties/[id]/visits/new';
import Maintenance from '../app/(app)/properties/[id]/maintenance/new';
import { propertiesApi } from '@/api/properties';
import { tenantsApi } from '@/api/tenants';
import { interestedApi } from '@/api/interested';
import { whatsappApi } from '@/api/whatsapp';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  settle,
  textContent,
} from './render';
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'selected' });
  jest
    .spyOn(propertiesApi, 'getById')
    .mockResolvedValue({ id: 'selected', name: 'Apartment' } as never);
  jest.spyOn(tenantsApi, 'getById').mockResolvedValue({
    id: 'selected',
    firstName: 'Ana',
    lastName: 'Tenant',
    phone: '12345678',
  } as never);
});
it('validates tenant activity and preserves its selected person and optional scheduled date', async () => {
  const request = jest
    .spyOn(tenantsApi, 'createActivity')
    .mockResolvedValue({ id: 'activity' } as never);
  const app = await renderApp(<TenantActivity />);
  await press(app, 'tenantActivityCreate.submit');
  expect(request).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'tenants.errors.activitySubjectRequired',
  );
  await input(app, 'tenantActivityCreate.subject', ' Call Ana ');
  await input(app, 'tenantActivityCreate.body', ' Details ');
  await press(app, 'tenantActivityCreate.type.call');
  await press(app, 'tenantActivityCreate.toggleDueAt');
  await press(app, 'tenantActivityCreate.dueAt.date');
  await act(async () =>
    control(app, 'tenantActivityCreate.dueAt.picker').props.onValueChange(
      { type: 'set' },
      new Date('2026-10-15T12:30:00Z'),
    ),
  );
  await press(app, 'tenantActivityCreate.dueAt.time');
  await act(async () =>
    control(app, 'tenantActivityCreate.dueAt.picker').props.onDismiss(),
  );
  await press(app, 'tenantActivityCreate.submit');
  expect(request).toHaveBeenCalledWith('selected', {
    type: 'call',
    subject: 'Call Ana',
    body: 'Details',
    dueAt: '2026-10-15T12:30:00.000Z',
  });
  expect(router.replace).toHaveBeenCalledWith('/(app)/tenants/selected');
});
it('keeps WhatsApp request identity stable after an uncertain failure and never also creates a second activity', async () => {
  const request = jest
    .spyOn(whatsappApi, 'createActivity')
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValue({} as never);
  const ordinary = jest.spyOn(tenantsApi, 'createActivity');
  const app = await renderApp(<TenantActivity />);
  await input(app, 'tenantActivityCreate.subject', 'Reminder');
  await press(app, 'tenantActivityCreate.type.whatsapp');
  await press(app, 'tenantActivityCreate.submit');
  expect(router.replace).not.toHaveBeenCalled();
  await press(app, 'tenantActivityCreate.submit');
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0].requestId).toBe(
    request.mock.calls[1][0].requestId,
  );
  expect(request.mock.calls[0][0].personId).toBe('selected');
  expect(ordinary).not.toHaveBeenCalled();
});
it('rejects WhatsApp without a scoped tenant phone and preserves a retryable query failure', async () => {
  jest
    .mocked(tenantsApi.getById)
    .mockResolvedValue({ id: 'selected', phone: '' } as never);
  const request = jest.spyOn(whatsappApi, 'createActivity');
  const app = await renderApp(<TenantActivity />);
  await input(app, 'tenantActivityCreate.subject', 'Reminder');
  await press(app, 'tenantActivityCreate.type.whatsapp');
  await press(app, 'tenantActivityCreate.submit');
  expect(request).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'tenants.fields.phone',
  );
});
it.each([TenantActivity, Visit, Maintenance])(
  'does not expose a writable form while its scoped resource failed to load',
  async (Component) => {
    jest.mocked(tenantsApi.getById).mockRejectedValue(new Error('Forbidden'));
    jest
      .mocked(propertiesApi.getById)
      .mockRejectedValue(new Error('Forbidden'));
    const app = await renderApp(<Component />);
    expect(textContent(app)).toContain('Forbidden');
    expect(textContent(app)).toContain('common.retry');
  },
);
it('preserves ordinary interested activity status and optional date, and reports failed saves without navigation', async () => {
  const request = jest
    .spyOn(interestedApi, 'addActivity')
    .mockRejectedValueOnce('offline')
    .mockResolvedValue({} as never);
  const app = await renderApp(<InterestedActivity />);
  await press(app, 'interestedActivityCreate.submit');
  expect(request).not.toHaveBeenCalled();
  await input(app, 'interestedActivityCreate.subject', ' Follow up ');
  await input(app, 'interestedActivityCreate.body', ' Body ');
  await press(app, 'interestedActivityCreate.type.note');
  await press(app, 'interestedActivityCreate.status.completed');
  await press(app, 'interestedActivityCreate.dueAt');
  await act(async () =>
    control(app, 'interestedActivityCreate.dueAt.picker').props.onValueChange(
      { type: 'set' },
      new Date(2026, 10, 1),
    ),
  );
  await press(app, 'interestedActivityCreate.submit');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.saveError',
  );
  expect(router.back).not.toHaveBeenCalled();
  await press(app, 'interestedActivityCreate.submit');
  expect(request).toHaveBeenLastCalledWith('selected', {
    type: 'note',
    status: 'completed',
    subject: 'Follow up',
    body: 'Body',
    dueAt: '2026-11-01',
  });
  expect(router.back).toHaveBeenCalled();
});
it('uses one request ID across an interested WhatsApp retry and rejects absent route IDs', async () => {
  const request = jest
    .spyOn(whatsappApi, 'createActivity')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({} as never);
  const app = await renderApp(<InterestedActivity />);
  await input(app, 'interestedActivityCreate.subject', 'Reminder');
  await press(app, 'interestedActivityCreate.type.whatsapp');
  await press(app, 'interestedActivityCreate.submit');
  await press(app, 'interestedActivityCreate.submit');
  expect(request.mock.calls[0][0].requestId).toBe(
    request.mock.calls[1][0].requestId,
  );
  expect(request.mock.calls[0][0].personType).toBe('interested');
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  const missing = await renderApp(<InterestedActivity />);
  await input(missing, 'interestedActivityCreate.subject', 'Reminder');
  await press(missing, 'interestedActivityCreate.submit');
  expect(Alert.alert).toHaveBeenCalledWith('common.error', 'common.error');
});
it('rejects invalid offer money before registering a visit and accepts a decimal comma', async () => {
  const request = jest
    .spyOn(propertiesApi, 'createVisit')
    .mockResolvedValue({} as never);
  const app = await renderApp(<Visit />);
  await press(app, 'visitCreate.submit');
  expect(request).not.toHaveBeenCalled();
  await input(app, 'visitCreate.interestedName', ' Ana ');
  await input(app, 'visitCreate.comments', ' Viewed ');
  await press(app, 'visitCreate.hasOffer');
  for (const value of ['', 'NaN', '1e3', '-10', '0', '1.234']) {
    await input(app, 'visitCreate.offerAmount', value);
    await press(app, 'visitCreate.submit');
  }
  expect(request).not.toHaveBeenCalled();
  await input(app, 'visitCreate.offerAmount', '100,25');
  await input(app, 'visitCreate.offerCurrency', 'USD');
  await press(app, 'visitCreate.visitedAt.date');
  await act(async () =>
    control(app, 'visitCreate.visitedAt.picker').props.onValueChange(
      { type: 'set' },
      new Date('2026-11-15T12:30:00Z'),
    ),
  );
  await press(app, 'visitCreate.visitedAt.time');
  await act(async () =>
    control(app, 'visitCreate.visitedAt.picker').props.onValueChange(
      { type: 'set' },
      new Date('2026-11-15T12:30:00Z'),
    ),
  );
  await press(app, 'visitCreate.submit');
  expect(request).toHaveBeenCalledWith(
    'selected',
    expect.objectContaining({
      interestedName: 'Ana',
      comments: 'Viewed',
      offerAmount: 100.25,
      offerCurrency: 'USD',
      hasOffer: true,
    }),
  );
  expect(router.replace).toHaveBeenCalledWith('/(app)/properties/selected');
});
it('preserves a failed visit and sends no offer amount when the offer is unchecked', async () => {
  const request = jest
    .spyOn(propertiesApi, 'createVisit')
    .mockRejectedValueOnce(new Error('Failed'))
    .mockResolvedValue({} as never);
  const app = await renderApp(<Visit />);
  await input(app, 'visitCreate.interestedName', 'Ana');
  await press(app, 'visitCreate.submit');
  expect(router.replace).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('common.error', 'Failed');
  await press(app, 'visitCreate.submit');
  expect(request).toHaveBeenLastCalledWith(
    'selected',
    expect.objectContaining({
      hasOffer: false,
      offerAmount: undefined,
      comments: undefined,
    }),
  );
});
it('validates maintenance title, records a chosen schedule and retains values after server rejection', async () => {
  const request = jest
    .spyOn(propertiesApi, 'createMaintenanceTask')
    .mockRejectedValueOnce('offline')
    .mockResolvedValue({} as never);
  const app = await renderApp(<Maintenance />);
  await press(app, 'maintenanceCreate.submit');
  expect(request).not.toHaveBeenCalled();
  await input(app, 'maintenanceCreate.title', ' Paint ');
  await input(app, 'maintenanceCreate.notes', ' Repair ');
  await press(app, 'maintenanceCreate.scheduledAt.date');
  await act(async () =>
    control(app, 'maintenanceCreate.scheduledAt.picker').props.onValueChange(
      { type: 'set' },
      new Date('2026-11-01T12:30:00Z'),
    ),
  );
  await press(app, 'maintenanceCreate.scheduledAt.time');
  await act(async () =>
    control(app, 'maintenanceCreate.scheduledAt.picker').props.onDismiss(),
  );
  await press(app, 'maintenanceCreate.submit');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.saveError',
  );
  expect(router.replace).not.toHaveBeenCalled();
  await press(app, 'maintenanceCreate.submit');
  expect(request).toHaveBeenCalledWith('selected', {
    title: 'Paint',
    notes: 'Repair',
    scheduledAt: '2026-11-01T12:30:00.000Z',
  });
  expect(router.replace).toHaveBeenCalledWith('/(app)/properties/selected');
});
it('handles dismissed native date pickers without changing existing values on iOS', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const app = await renderApp(<TenantActivity />);
  await press(app, 'tenantActivityCreate.toggleDueAt');
  await press(app, 'tenantActivityCreate.dueAt.date');
  await act(async () =>
    control(app, 'tenantActivityCreate.dueAt.picker').props.onValueChange(
      { type: 'dismissed' },
      undefined,
    ),
  );
  await act(async () =>
    control(app, 'tenantActivityCreate.dueAt.picker').props.onValueChange(
      { type: 'set' },
      new Date('2026-12-01'),
    ),
  );
  expect(
    app.root.findAll(
      (node) => node.props.testID === 'tenantActivityCreate.dueAt.picker',
    ),
  ).toHaveLength(0);
  await press(app, 'tenantActivityCreate.toggleDueAt');
  await settle();
});
