import { createElement, type ReactNode } from 'react';
import { act } from 'react-test-renderer';
import { Alert, LogBox, useColorScheme } from 'react-native';
import { darkColors, lightColors } from '@/contexts/theme-context';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import NewTemplate from '../app/(app)/templates/new';
import EditTemplate from '../app/(app)/templates/[kind]/[id]/edit';
import TemplateDetail from '../app/(app)/templates/[kind]/[id]/index';
import OwnerPay from '../app/(app)/owners/[id]/pay';
import ProtectedLayout from '../app/(app)/_layout';
import RootLayout from '../app/_layout';
import * as deferred from '@/config/deferred-features';
import * as templates from '@/api/templates';
import { ownersApi } from '@/api/owners';
import { setAuth } from './auth-fixture';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  settle,
  textContent,
} from './render';
jest.mock('@/contexts/auth-context', () => ({
  useAuth: jest.fn(),
  AuthProvider: (props: { children: ReactNode }) =>
    createElement('AuthProvider', {}, props.children),
}));
jest.mock('@/screens/template-form', () => ({
  TemplateForm: (props: object) => createElement('ValidatedForm', props),
}));
jest.mock('@/config/deferred-features', () => ({
  __esModule: true,
  EXTERNAL_SETTLEMENTS_ENABLED: false,
}));
jest.mock('@/api/env', () => ({
  __esModule: true,
  IS_E2E_MODE: false,
  IS_MOCK_MODE: false,
  API_URL: 'https://rent.example/api',
}));
const template = {
  id: 'selected',
  kind: 'payment' as const,
  name: 'Receipt',
  paymentType: 'receipt' as const,
  templateBody: 'Agreed template',
  isActive: true,
  isDefault: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const form = (app: Awaited<ReturnType<typeof renderApp>>) =>
  app.root.findByType('ValidatedForm' as never);
beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue('light');
  setAuth();
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ id: 'selected', kind: 'payment' });
  jest.spyOn(templates, 'getTemplate').mockResolvedValue(template);
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
it('creates a template with its server-selected kind/id and keeps failed submissions reviewable', async () => {
  const request = jest
    .spyOn(templates, 'createTemplate')
    .mockRejectedValueOnce(new Error('Failed'))
    .mockResolvedValue(template);
  const app = await renderApp(<NewTemplate />);
  await act(async () => {
    await expect(form(app).props.onSubmit(template)).rejects.toThrow('Failed');
  });
  expect(router.replace).not.toHaveBeenCalled();
  await act(async () => form(app).props.onSubmit(template));
  expect(request.mock.calls[0][0]).toEqual(template);
  expect(router.replace).toHaveBeenCalledWith(
    '/(app)/templates/payment/selected',
  );
});
it('edits the requested template domain without sending a mutable kind', async () => {
  const request = jest
    .spyOn(templates, 'updateTemplate')
    .mockResolvedValue(template);
  const app = await renderApp(<EditTemplate />);
  await act(async () => form(app).props.onSubmit(template));
  const { kind: _, ...payload } = template;
  expect(request).toHaveBeenCalledWith('payment', 'selected', payload);
  expect(router.replace).toHaveBeenCalledWith(
    '/(app)/templates/payment/selected',
  );
});
it('retains a template edit after rejection and distinguishes query failure from a missing record', async () => {
  jest.spyOn(templates, 'updateTemplate').mockRejectedValue('offline');
  const app = await renderApp(<EditTemplate />);
  await act(async () => {
    await expect(form(app).props.onSubmit(template)).rejects.toBe('offline');
  });
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.saveError',
  );
  expect(form(app).props.initial.id).toBe('selected');
  jest.mocked(templates.getTemplate).mockRejectedValue(new Error('Forbidden'));
  const failed = await renderApp(<EditTemplate />);
  expect(textContent(failed)).toContain('Forbidden');
  expect(textContent(failed)).not.toContain('templatesHub.templateNotFound');
});
it.each([EditTemplate, TemplateDetail])(
  'rejects unknown template kinds without fetching an unauthorized collection',
  async (Component) => {
    jest
      .mocked(useLocalSearchParams)
      .mockReturnValue({ id: 'selected', kind: 'invalid' });
    const app = await renderApp(<Component />);
    expect(templates.getTemplate).not.toHaveBeenCalled();
    expect(textContent(app)).toContain('common.error');
  },
);
it.each([EditTemplate, TemplateDetail])(
  'renders a missing template without editable controls',
  async (Component) => {
    jest.mocked(templates.getTemplate).mockResolvedValue(null);
    const app = await renderApp(<Component />);
    expect(textContent(app)).toContain('templatesHub.templateNotFound');
    expect(app.root.findAllByType('ValidatedForm' as never)).toHaveLength(0);
  },
);
it('shows payment scope/default status and asks before deleting the exact template', async () => {
  const request = jest.spyOn(templates, 'deleteTemplate').mockResolvedValue();
  const app = await renderApp(<TemplateDetail />);
  expect(textContent(app)).toContain('templatesHub.defaultLabel');
  await press(app, 'templateDetail.edit');
  expect(router.push).toHaveBeenCalledWith(
    '/(app)/templates/payment/selected/edit',
  );
  await press(app, 'templateDetail.delete');
  expect(request).not.toHaveBeenCalled();
  const options = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  await act(async () =>
    options?.find((button) => button.style === 'destructive')?.onPress?.(),
  );
  await settle();
  expect(request).toHaveBeenCalledWith('payment', 'selected');
  expect(router.replace).toHaveBeenCalledWith('/(app)/templates');
});
it('renders inactive lease templates and keeps deletion failures visible', async () => {
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ id: 'selected', kind: 'lease' });
  jest.mocked(templates.getTemplate).mockResolvedValue({
    ...template,
    kind: 'lease',
    contractType: 'sale',
    isActive: false,
  });
  const request = jest
    .spyOn(templates, 'deleteTemplate')
    .mockRejectedValue('offline');
  const app = await renderApp(<TemplateDetail />);
  expect(textContent(app)).toContain('sale');
  expect(textContent(app)).toContain('templatesHub.inactive');
  await press(app, 'templateDetail.delete');
  await act(async () =>
    jest
      .mocked(Alert.alert)
      .mock.calls.at(-1)?.[2]
      ?.find((button) => button.style === 'destructive')
      ?.onPress?.(),
  );
  await settle();
  expect(request).toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'messages.deleteError',
  );
  expect(router.replace).not.toHaveBeenCalled();
});
it('renders permission-aware stack header actions and actual app provider composition', async () => {
  jest.mocked(usePathname).mockReturnValue('/owners');
  const app = await renderApp(<ProtectedLayout />);
  for (const [name, id] of [
    ['owners', 'owners.new'],
    ['users', 'users.new'],
    ['templates', 'templates.new'],
  ]) {
    const header = app.root
      .findAllByType('StackScreen' as never)
      .find((node) => node.props.name === name)!.props.options.headerRight;
    const action = await renderApp(header());
    await press(action, id);
    expect(router.push).toHaveBeenCalledWith(`/(app)/${name}/new`);
  }
  const root = await renderApp(<RootLayout />);
  expect(
    root.root.findAllByType('GestureHandlerRootView' as never),
  ).toHaveLength(1);
  expect(root.root.findAllByType('AuthProvider' as never)).toHaveLength(1);
  expect(root.root.findAllByType('StatusBar' as never)).toHaveLength(1);
  expect(LogBox.ignoreAllLogs).not.toHaveBeenCalled();
});
it.each(['light', 'dark'] as const)(
  'sets %s native status bar and navigation surfaces from appearance',
  async (mode) => {
    jest.mocked(useColorScheme).mockReturnValue(mode);
    const app = await renderApp(<RootLayout />);
    expect(app.root.findByType('StatusBar' as never).props.style).toBe(
      mode === 'dark' ? 'light' : 'dark',
    );
    expect(
      app.root.findByType('Stack' as never).props.screenOptions.contentStyle
        .backgroundColor,
    ).toBe(mode === 'dark' ? darkColors.background : lightColors.background);
  },
);
describe('deferred settlement form through isolated in-memory fixtures', () => {
  beforeEach(() => {
    jest.replaceProperty(
      deferred as { EXTERNAL_SETTLEMENTS_ENABLED: boolean },
      'EXTERNAL_SETTLEMENTS_ENABLED',
      true,
    );
    jest.spyOn(ownersApi, 'getById').mockResolvedValue({
      id: 'selected',
      firstName: 'Ana',
      lastName: 'Owner',
    } as never);
  });
  const settlement = (id: string, status: string, amount = 100.25) => ({
    id,
    ownerId: 'selected',
    period: '2026-10',
    currencyCode: 'ARS',
    netAmount: amount,
    grossAmount: 110.25,
    commissionAmount: 10,
    status,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  });
  it('uses exact net cents from the selected settlement and recovers from errors without enabling the production switch', async () => {
    jest
      .spyOn(ownersApi, 'getSettlements')
      .mockResolvedValue([
        settlement('pending', 'pending'),
        settlement('processing', 'processing', 200.25),
        settlement('completed', 'completed'),
      ] as never);
    const request = jest
      .spyOn(ownersApi, 'registerSettlementPayment')
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValue(
        settlement('processing', 'completed', 200.25) as never,
      );
    const download = jest
      .spyOn(ownersApi, 'downloadSettlementReceipt')
      .mockRejectedValue(new Error('Download failed'));
    const app = await renderApp(<OwnerPay />);
    expect(textContent(app)).toContain('100,25');
    await press(app, 'ownerPay.settlement.processing');
    await input(app, 'ownerPay.reference', ' REF ');
    await input(app, 'ownerPay.notes', ' Notes ');
    await press(app, 'ownerPay.paymentDate');
    await act(async () =>
      control(app, 'ownerPay.paymentDate.picker').props.onValueChange(
        { type: 'set' },
        new Date(2026, 10, 1),
      ),
    );
    await press(app, 'ownerPay.submit');
    expect(router.back).not.toHaveBeenCalled();
    await press(app, 'ownerPay.submit');
    expect(request).toHaveBeenLastCalledWith('selected', 'processing', {
      amount: 200.25,
      paymentDate: '2026-11-01',
      reference: 'REF',
      notes: 'Notes',
    });
    expect(router.back).toHaveBeenCalled();
    await press(app, 'ownerPay.download.completed');
    expect(download).toHaveBeenCalledWith('selected', 'completed');
    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'Download failed');
  });
  it('shows an empty settlement history without exposing a payment form', async () => {
    jest.spyOn(ownersApi, 'getSettlements').mockResolvedValue([]);
    jest.mocked(ownersApi.getById).mockResolvedValue(null);
    const request = jest.spyOn(ownersApi, 'registerSettlementPayment');
    const app = await renderApp(<OwnerPay />);
    expect(textContent(app)).toContain('properties.ownerNoPendingSettlements');
    expect(textContent(app)).toContain('properties.ownerNoRecentPayments');
    expect(request).not.toHaveBeenCalled();
    expect(
      app.root.findAll((node) => node.props.testID === 'ownerPay.submit'),
    ).toHaveLength(0);
  });
});
