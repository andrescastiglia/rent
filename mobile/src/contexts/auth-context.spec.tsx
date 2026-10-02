import { act } from 'react-test-renderer';
import { router } from 'expo-router';
import { AuthProvider, useAuth } from './auth-context';
import { restoreSession } from './auth-session';
import { authApi } from '@/api/auth';
import { setSessionExpiredHandler } from '@/api/client';
import { clearAuth, setToken } from '@/storage/auth-storage';
import { i18n } from '@/i18n';
import { admin } from '../../tests/auth-fixture';
import { cleanup, renderApp } from '../../tests/render';

jest.mock('./auth-session', () => ({ restoreSession: jest.fn() }));
jest.mock('@/api/auth', () => ({
  authApi: { login: jest.fn(), register: jest.fn() },
}));
jest.mock('@/api/client', () => ({
  setSessionExpiredHandler: jest.fn(() => jest.fn()),
}));
jest.mock('@/storage/auth-storage', () => ({
  clearAuth: jest.fn(),
  setToken: jest.fn(),
}));
let auth: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}
beforeEach(() => {
  jest.mocked(restoreSession).mockResolvedValue(null);
});
afterEach(cleanup);
it('restores the current user and language from the server-validated session', async () => {
  jest
    .mocked(restoreSession)
    .mockResolvedValue({ token: 'stored', user: { ...admin, language: 'pt' } });
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(auth.loading).toBe(false);
  expect(auth.token).toBe('stored');
  expect(auth.user?.id).toBe(admin.id);
  expect(i18n.changeLanguage).toHaveBeenCalledWith('pt');
});
it('clears an unreadable session and exits loading without exposing a cached user', async () => {
  jest.mocked(restoreSession).mockRejectedValue(new Error('invalid token'));
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(clearAuth).toHaveBeenCalled();
  expect(auth).toEqual(
    expect.objectContaining({ user: null, token: null, loading: false }),
  );
});
it('persists successful login, changes language and routes every role to Home', async () => {
  jest.mocked(authApi.login).mockResolvedValue({
    accessToken: 'new-token',
    user: { ...admin, role: 'buyer', roles: ['buyer'], language: 'en' },
  });
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    await auth.login({ email: 'buyer@example.com', password: 'password' });
  });
  expect(setToken).toHaveBeenCalledWith('new-token');
  expect(auth.user?.role).toBe('buyer');
  expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
  expect(router.replace).toHaveBeenCalledWith('/(app)/(tabs)/home');
});
it('does not mutate the session or navigate when login is rejected', async () => {
  jest
    .mocked(authApi.login)
    .mockRejectedValue(new Error('Invalid credentials'));
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await expect(
    auth.login({ email: 'bad@example.com', password: 'password' }),
  ).rejects.toThrow('Invalid credentials');
  expect(auth.user).toBeNull();
  expect(setToken).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
it('returns registration for approval without authenticating and updates the active profile language', async () => {
  const registration = {
    pendingApproval: true,
    userId: 'new-user',
    message: 'Pending approval',
  };
  jest.mocked(authApi.register).mockResolvedValue(registration);
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(
    await auth.register({
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
      password: 'password',
    }),
  ).toEqual(registration);
  expect(auth.user).toBeNull();
  await act(async () => {
    await auth.updateUser({ ...admin, language: 'es' });
  });
  expect(auth.user?.firstName).toBe('Ana');
  expect(i18n.changeLanguage).toHaveBeenCalledWith('es');
  await act(async () => {
    await auth.updateUser(admin);
  });
  expect(auth.user?.id).toBe(admin.id);
});
it('clears credentials and protected caches on logout and on session expiration', async () => {
  jest
    .mocked(restoreSession)
    .mockResolvedValue({ token: 'stored', user: admin });
  await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    await auth.logout();
  });
  expect(clearAuth).toHaveBeenCalled();
  expect(auth.user).toBeNull();
  expect(auth.token).toBeNull();
  expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  const expired = jest.mocked(setSessionExpiredHandler).mock.calls.at(-1)?.[0];
  await act(async () => {
    expired?.();
    await Promise.resolve();
  });
  expect(clearAuth).toHaveBeenCalledTimes(2);
});
it('does not publish a restored session after its provider unmounts', async () => {
  let done!: (session: Awaited<ReturnType<typeof restoreSession>>) => void;
  jest.mocked(restoreSession).mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const app = await renderApp(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(auth.loading).toBe(true);
  await act(async () => {
    app.unmount();
    done({ token: 'late', user: admin });
  });
  expect(i18n.changeLanguage).not.toHaveBeenCalled();
});
it('requires the provider instead of supplying an implicit anonymous session', async () => {
  expect(() => useAuth()).toThrow();
});
