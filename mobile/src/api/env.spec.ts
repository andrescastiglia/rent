describe('mobile env', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_MOCK_MODE;
    delete process.env.EXPO_PUBLIC_E2E_MODE;
    process.env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV'),
    ) as NodeJS.ProcessEnv;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses defaults when env vars are missing', async () => {
    const env = await import('./env');

    expect(env.API_URL).toBe('https://rent.maese.com.ar/api');
    expect(env.IS_MOCK_MODE).toBe(false);
    expect(env.IS_E2E_MODE).toBe(false);
  });

  it('derives flags from explicit mock and e2e env vars', async () => {
    process.env.EXPO_PUBLIC_API_URL = ' https://api.example.com ';
    process.env.EXPO_PUBLIC_MOCK_MODE = 'true';
    process.env.EXPO_PUBLIC_E2E_MODE = 'true';

    const env = await import('./env');

    expect(env.API_URL).toBe('https://api.example.com');
    expect(env.IS_MOCK_MODE).toBe(true);
    expect(env.IS_E2E_MODE).toBe(true);
  });

  it('enables mock mode automatically during tests', async () => {
    process.env = { ...process.env, NODE_ENV: 'test' };

    const env = await import('./env');

    expect(env.IS_MOCK_MODE).toBe(true);
  });
});
