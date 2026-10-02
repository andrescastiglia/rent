import { act } from 'react-test-renderer';
import { Alert, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  ThemeProvider,
  lightColors,
  darkColors,
} from '@/contexts/theme-context';
import * as Linking from 'expo-linking';
import { router, usePathname } from 'expo-router';
import Home from '../app/(app)/(tabs)/home';
import Tasks from '../app/(app)/(tabs)/tasks';
import More from '../app/(app)/(tabs)/more';
import Settings from '../app/(app)/(tabs)/settings';
import ProtectedLayout from '../app/(app)/_layout';
import TabsLayout from '../app/(app)/(tabs)/_layout';
import Index from '../app/index';
import { RootNavigation } from '../app/_layout';
import { ChannelAlternatives } from '@/components/channel-alternatives';
import { useCanAccess } from '@/hooks/use-role-navigation';
import { ownersApi } from '@/api/owners';
import { admin, setAuth } from './auth-fixture';
import { cleanup, press, renderApp, settle, textContent } from './render';

jest.mock('@/contexts/auth-context', () => ({ useAuth: jest.fn() }));
beforeEach(() => {
  jest.mocked(useColorScheme).mockReturnValue('light');
  setAuth();
  jest.mocked(usePathname).mockReturnValue('/home');
});
afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});
const labeled = (app: Awaited<ReturnType<typeof renderApp>>, label: string) =>
  app.root.findAll(
    (node) =>
      (node.type as unknown) === 'Pressable' &&
      node.props.accessibilityLabel === label,
  )[0];
it('offers only permitted task routes and all permitted modules in More', async () => {
  setAuth({
    ...admin,
    role: 'staff',
    roles: ['staff'],
    permissions: {
      properties: true,
      tenants: true,
      payments: false,
      users: false,
    },
  });
  const tasks = await renderApp(<Tasks />);
  await press(tasks, 'tasks.properties');
  expect(router.push).toHaveBeenCalledWith('/(app)/properties');
  expect(textContent(tasks)).not.toContain('tasks.payments');
  expect(textContent(tasks)).not.toContain('tasks.users');
  const more = await renderApp(<More />);
  await press(more, 'more.tenants');
  expect(router.push).toHaveBeenCalledWith('/(app)/tenants');
  await act(async () => {
    labeled(more, 'common.settings').props.onPress();
  });
  expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/settings');
});
it('shows a buyer the native sales entry without company financial summary', async () => {
  setAuth({ ...admin, role: 'buyer', roles: ['buyer'] });
  const app = await renderApp(<Home />);
  expect(labeled(app, 'navigation.summary')).toBeUndefined();
  await act(async () => {
    labeled(app, 'navigation.tasks').props.onPress();
  });
  expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/tasks');
  const more = await renderApp(<More />);
  await press(more, 'more.sales');
  expect(router.push).toHaveBeenCalledWith('/(app)/sales');
});
it('displays the own-owner canonical collections separately by currency', async () => {
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  jest.spyOn(ownersApi, 'getMySummary').mockResolvedValue({
    period: '2026-10',
    propertiesCount: 2,
    activeLeases: 1,
    collectionsByCurrency: [
      { currencyCode: 'ARS', amount: 850 },
      { currencyCode: 'USD', amount: 40 },
    ],
    reconciled: true,
  } as never);
  const app = await renderApp(<Home />);
  expect(textContent(app)).toContain('ARS');
  expect(textContent(app)).toContain('850');
  expect(textContent(app)).toContain('USD');
  expect(textContent(app)).toContain('40');
  expect(labeled(app, 'navigation.summary')).toBeDefined();
});
it('shows owner summary errors and retries rather than showing an invented zero', async () => {
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  const fetch = jest
    .spyOn(ownersApi, 'getMySummary')
    .mockRejectedValueOnce(new Error('Summary unavailable'))
    .mockResolvedValueOnce({
      period: '2026-10',
      propertiesCount: 0,
      activeLeases: 0,
      collectionsByCurrency: [],
      reconciled: true,
    } as never);
  const app = await renderApp(<Home />);
  expect(textContent(app)).toContain('Summary unavailable');
  await act(async () => {
    labeled(app, 'common.retry').props.onPress();
  });
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(textContent(app)).toContain('2026-10');
});
it('opens the explicit authenticated browser alternative without passing the API token', async () => {
  const app = await renderApp(<ChannelAlternatives />);
  await press(app, 'channels.proposalReview');
  expect(Linking.openURL).toHaveBeenCalledWith(
    'https://rent.maese.com.ar/es/dashboard#pending-actions',
  );
  jest
    .mocked(Linking.openURL)
    .mockRejectedValueOnce(new Error('Browser unavailable'));
  await press(app, 'channels.proposalReview');
  expect(Alert.alert).toHaveBeenCalledWith(
    'common.error',
    'channels.openError',
  );
  setAuth(null);
  const anonymous = await renderApp(<ChannelAlternatives />);
  expect(anonymous.toJSON()).toBeNull();
  setAuth({ ...admin, role: 'staff', roles: ['staff'], permissions: {} });
  const denied = await renderApp(<ChannelAlternatives />);
  expect(denied.toJSON()).toBeNull();
});
it('keeps logout in Settings and performs it explicitly', async () => {
  const auth = setAuth();
  const app = await renderApp(<Settings />);
  await act(async () => {
    labeled(app, 'auth.logout').props.onPress();
  });
  expect(auth.logout).toHaveBeenCalled();
});
it('redirects missing and denied sessions while waiting for bootstrap', async () => {
  setAuth(null, { loading: true });
  const loading = await renderApp(<ProtectedLayout />);
  expect(loading.root.findAllByType('ActivityIndicator' as never)).toHaveLength(
    1,
  );
  setAuth(null);
  const anonymous = await renderApp(<ProtectedLayout />);
  expect(anonymous.root.findByType('Redirect' as never).props.href).toBe(
    '/(auth)/login',
  );
  setAuth({ ...admin, role: 'buyer', roles: ['buyer'] });
  jest.mocked(usePathname).mockReturnValue('/payments/new');
  const denied = await renderApp(<ProtectedLayout />);
  expect(denied.root.findByType('Redirect' as never).props.href).toBe(
    '/(app)/(tabs)/home',
  );
  setAuth();
  jest.mocked(usePathname).mockReturnValue('/home');
  const allowed = await renderApp(<ProtectedLayout />);
  expect(
    allowed.root.findAllByType('StackScreen' as never).length,
  ).toBeGreaterThan(20);
});
it('waits for session restoration before mounting the root native navigation tree', async () => {
  setAuth(null, { loading: true });
  const loading = await renderApp(<RootNavigation />);
  expect(loading.root.findAllByType('Stack' as never)).toHaveLength(0);
  expect(loading.root.findAllByType('ActivityIndicator' as never)).toHaveLength(
    1,
  );
  await cleanup();
  setAuth();
  const ready = await renderApp(<RootNavigation />);
  expect(ready.root.findAllByType('Stack' as never)).toHaveLength(1);
});
it('exposes exactly Home, Tasks and More as visible tabs and correct authorized creation routes', async () => {
  const app = await renderApp(<TabsLayout />);
  const screens = app.root.findAllByType('TabsScreen' as never);
  expect(
    screens
      .filter((node) => node.props.options.href !== null)
      .map((node) => node.props.name),
  ).toEqual(['home', 'tasks', 'more']);
  for (const screen of screens) {
    if (screen.props.options.tabBarIcon) {
      const icon = await renderApp(
        screen.props.options.tabBarIcon({
          color: 'blue',
          size: 20,
          focused: false,
        }),
      );
      expect(icon.root.findAllByType('Ionicons' as never)).toHaveLength(1);
    }
    if (screen.props.options.headerLeft) {
      const header = await renderApp(screen.props.options.headerLeft());
      const button = header.root.findByType('Pressable' as never);
      await act(async () => {
        button.props.onPress();
      });
      expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/home');
    }
  }
  const properties = screens.find((node) => node.props.name === 'properties');
  const header = await renderApp(properties?.props.options.headerRight());
  await press(header, 'properties.new');
  expect(router.push).toHaveBeenCalledWith('/(app)/properties/new');
  setAuth({ ...admin, role: 'owner', roles: ['owner'] });
  const external = await renderApp(<TabsLayout />);
  expect(
    external.root
      .findAllByType('TabsScreen' as never)
      .find((node) => node.props.name === 'properties')?.props.options
      .headerRight,
  ).toBeUndefined();
});
it('routes signed-in sessions to Home and unauthenticated sessions to login', async () => {
  const signed = await renderApp(<Index />);
  expect(signed.root.findByType('Redirect' as never).props.href).toBe(
    '/(app)/(tabs)/home',
  );
  setAuth(null);
  const anonymous = await renderApp(<Index />);
  expect(anonymous.root.findByType('Redirect' as never).props.href).toBe(
    '/(auth)/login',
  );
  setAuth(null, { loading: true });
  const loading = await renderApp(<Index />);
  expect(loading.root.findAllByType('ActivityIndicator' as never)).toHaveLength(
    1,
  );
});
it('returns no module access for an anonymous session', async () => {
  setAuth(null);
  let allowed = true;
  function Probe() {
    allowed = useCanAccess('/properties');
    return null;
  }
  await renderApp(<Probe />);
  expect(allowed).toBe(false);
});
it('changes actual settings appearance and persists an explicit override of the system theme', async () => {
  jest.mocked(useColorScheme).mockReturnValue('dark');
  const app = await renderApp(
    <ThemeProvider>
      <Settings />
    </ThemeProvider>,
  );
  const background = () =>
    app.root.findByType('SafeAreaView' as never).props.style.at(-1)
      .backgroundColor;
  expect(background()).toBe(darkColors.background);
  await press(app, 'theme.preference.light');
  expect(background()).toBe(lightColors.background);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'rent.theme.preference',
    'light',
  );
  await press(app, 'theme.preference.system');
  expect(background()).toBe(darkColors.background);
});
