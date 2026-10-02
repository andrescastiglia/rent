import { createElement } from 'react';
import { act } from 'react-test-renderer';
import Login from './(auth)/login';
import Register from './(auth)/register';
import AuthLayout from './(auth)/_layout';
import { setAuth } from '../tests/auth-fixture';
import {
  cleanup,
  control,
  input,
  press,
  renderApp,
  textContent,
} from '../tests/render';

jest.mock('@/contexts/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@/components/turnstile-captcha', () => ({
  TurnstileCaptcha: (props: object) => createElement('CaptchaControl', props),
}));
afterEach(cleanup);
beforeEach(() => {
  setAuth(null);
});
const credentials = async (app: Awaited<ReturnType<typeof renderApp>>) => {
  await input(app, 'login.email', 'ana@example.com');
  await input(app, 'login.password', 'password123');
};
const registration = async (app: Awaited<ReturnType<typeof renderApp>>) => {
  const names = app.root.findAll(
    (node) =>
      (node.type as unknown) === 'TextInput' &&
      ['Nombre', 'Apellido'].includes(node.props.accessibilityLabel),
  );
  await act(async () => {
    names[0].props.onChangeText('Ana');
    names[1].props.onChangeText('Gomez');
  });
  await input(app, 'register.email', 'ana@example.com');
  await input(app, 'register.phone', '+5491100000000');
  await input(app, 'register.password', 'password123');
  await input(app, 'register.confirmPassword', 'password123');
};
it('submits validated login credentials and retains them when client validation fails', async () => {
  const auth = setAuth(null);
  const app = await renderApp(<Login />);
  await credentials(app);
  await press(app, 'login.submit');
  expect(auth.login).toHaveBeenCalledWith({
    email: 'ana@example.com',
    password: 'password123',
    captchaToken: undefined,
  });
  await input(app, 'login.email', 'invalid');
  await input(app, 'login.password', '123');
  await press(app, 'login.submit');
  expect(auth.login).toHaveBeenCalledTimes(1);
  expect(control(app, 'login.password').props.value).toBe('123');
});
it('requires a fresh CAPTCHA after invalid credentials and submits it on retry', async () => {
  const login = jest
    .fn()
    .mockRejectedValueOnce(new Error('Invalid credentials'))
    .mockResolvedValueOnce(undefined);
  setAuth(null, { login });
  const app = await renderApp(<Login />);
  await credentials(app);
  await press(app, 'login.submit');
  expect(textContent(app)).toContain('auth.errors.invalidCredentials');
  await press(app, 'login.submit');
  expect(login).toHaveBeenCalledTimes(1);
  expect(textContent(app)).toContain('auth.errors.captchaRequired');
  await act(async () => {
    app.root
      .findByType('CaptchaControl' as never)
      .props.onTokenChange('verified-token');
  });
  await press(app, 'login.submit');
  expect(login).toHaveBeenLastCalledWith(
    expect.objectContaining({ captchaToken: 'verified-token' }),
  );
  expect(app.root.findAllByType('CaptchaControl' as never)).toHaveLength(0);
});
it('honors server-required CAPTCHA even before an invalid-credential attempt', async () => {
  const login = jest.fn().mockRejectedValue(new Error('CAPTCHA_REQUIRED'));
  setAuth(null, { login });
  const app = await renderApp(<Login />);
  await credentials(app);
  await press(app, 'login.submit');
  expect(app.root.findAllByType('CaptchaControl' as never)).toHaveLength(1);
  expect(textContent(app)).toContain('auth.errors.captchaRequired');
});
it.each([
  [new Error('user.blocked'), 'auth.errors.blocked'],
  [new Error('CAPTCHA_INVALID'), 'auth.errors.captchaInvalid'],
  [new Error('CAPTCHA_NOT_CONFIGURED'), 'auth.errors.captchaUnavailable'],
  [new Error('Service unavailable'), 'Service unavailable'],
  ['untyped', 'auth.errors.loginError'],
])(
  'shows actionable login errors without erasing credentials',
  async (error, message) => {
    setAuth(null, { login: jest.fn().mockRejectedValue(error) });
    const app = await renderApp(<Login />);
    await credentials(app);
    await press(app, 'login.submit');
    expect(textContent(app)).toContain(message);
    expect(control(app, 'login.email').props.value).toBe('ana@example.com');
    expect(control(app, 'login.submit').props.accessibilityState.busy).toBe(
      false,
    );
  },
);
it('blocks registration until matching passwords and CAPTCHA are provided', async () => {
  const auth = setAuth(null);
  const app = await renderApp(<Register />);
  await registration(app);
  await input(app, 'register.confirmPassword', 'different');
  await press(app, 'register.submit');
  expect(textContent(app)).toContain('auth.errors.passwordMismatch');
  expect(auth.register).not.toHaveBeenCalled();
  await input(app, 'register.confirmPassword', 'password123');
  await press(app, 'register.submit');
  expect(textContent(app)).toContain('auth.errors.captchaRequired');
  expect(auth.register).not.toHaveBeenCalled();
});
it('requests approval without choosing privileged roles or starting an authenticated session', async () => {
  const register = jest.fn().mockResolvedValue({
    pendingApproval: true,
    userId: 'new-user',
    message: 'Awaiting administrator approval',
  });
  const auth = setAuth(null, { register });
  const app = await renderApp(<Register />);
  await registration(app);
  await act(async () => {
    app.root
      .findByType('CaptchaControl' as never)
      .props.onTokenChange('captcha-token');
  });
  await press(app, 'register.submit');
  expect(register).toHaveBeenCalledWith({
    firstName: 'Ana',
    lastName: 'Gomez',
    email: 'ana@example.com',
    phone: '+5491100000000',
    password: 'password123',
    captchaToken: 'captcha-token',
  });
  expect(auth.login).not.toHaveBeenCalled();
  expect(textContent(app)).toContain('Awaiting administrator approval');
  await press(app, 'register.submit');
  expect(register).toHaveBeenCalledTimes(1);
});
it.each([
  [new Error('Email already exists'), 'auth.errors.emailAlreadyRegistered'],
  [new Error('CAPTCHA_REQUIRED'), 'auth.errors.captchaRequired'],
  [new Error('CAPTCHA_INVALID'), 'auth.errors.captchaInvalid'],
  [new Error('CAPTCHA_NOT_CONFIGURED'), 'auth.errors.captchaUnavailable'],
  [new Error('Unavailable'), 'Unavailable'],
  ['untyped', 'auth.errors.registerError'],
])(
  'reports registration failure and clears the previously verified token',
  async (error, message) => {
    const register = jest.fn().mockRejectedValue(error);
    setAuth(null, { register });
    const app = await renderApp(<Register />);
    await registration(app);
    await act(async () => {
      app.root
        .findByType('CaptchaControl' as never)
        .props.onTokenChange('captcha-token');
    });
    await press(app, 'register.submit');
    expect(textContent(app)).toContain(message);
    await press(app, 'register.submit');
    expect(register).toHaveBeenCalledTimes(1);
  },
);
it('shows the localized pending-approval fallback if the server provides no message', async () => {
  setAuth(null, {
    register: jest
      .fn()
      .mockResolvedValue({ pendingApproval: true, userId: 'new', message: '' }),
  });
  const app = await renderApp(<Register />);
  await registration(app);
  await act(async () => {
    app.root.findByType('CaptchaControl' as never).props.onTokenChange('token');
  });
  await press(app, 'register.submit');
  expect(textContent(app)).toContain('auth.messages.pendingApproval');
});
it('registers the login and registration screens in the authentication stack', async () => {
  const app = await renderApp(<AuthLayout />);
  expect(
    app.root
      .findAllByType('StackScreen' as never)
      .map((node) => node.props.name),
  ).toEqual(['login', 'register']);
});
