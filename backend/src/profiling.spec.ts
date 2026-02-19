export {};

const originalEnv = process.env;

const initMock = jest.fn();
const startMock = jest.fn();
const stopMock = jest.fn();

jest.mock('@pyroscope/nodejs', () => ({
  init: (...args: unknown[]) => initMock(...args),
  start: (...args: unknown[]) => startMock(...args),
  stop: (...args: unknown[]) => stopMock(...args),
}));

describe('profiling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.PYROSCOPE_ENABLED;
    delete process.env.PYROSCOPE_SERVER_ADDRESS;
    delete process.env.PYROSCOPE_URL;
    delete process.env.PYROSCOPE_APPLICATION_NAME_BACKEND;
    delete process.env.PYROSCOPE_APPLICATION_NAME;
    delete process.env.PYROSCOPE_TAGS;
    delete process.env.PYROSCOPE_FLUSH_INTERVAL_MS;
    delete process.env.NODE_ENV;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not start when disabled by flag/environment', async () => {
    process.env.PYROSCOPE_ENABLED = 'false';
    let mod = await import('./profiling');
    mod.startProfiling();
    expect(initMock).not.toHaveBeenCalled();

    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PYROSCOPE_URL: 'http://p',
    };
    mod = await import('./profiling');
    mod.startProfiling();
    expect(initMock).not.toHaveBeenCalled();

    jest.resetModules();
    process.env = { ...originalEnv, CI: 'true', PYROSCOPE_URL: 'http://p' };
    mod = await import('./profiling');
    mod.startProfiling();
    expect(initMock).not.toHaveBeenCalled();
  });

  it('does not start when server address is missing', async () => {
    const mod = await import('./profiling');
    mod.startProfiling();
    expect(initMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('starts once with parsed tags and stops safely', async () => {
    process.env.PYROSCOPE_URL = 'http://pyroscope:4040';
    process.env.PYROSCOPE_TAGS = 'team=core, invalid, key=,region=ar=ba';
    process.env.PYROSCOPE_FLUSH_INTERVAL_MS = '5000';
    process.env.PYROSCOPE_APPLICATION_NAME = 'rent-app';
    process.env.NODE_ENV = 'production';
    process.env.npm_package_version = '1.2.3';

    const mod = await import('./profiling');

    mod.startProfiling();
    mod.startProfiling();

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: 'rent-app',
        serverAddress: 'http://pyroscope:4040',
        flushIntervalMs: 5000,
        tags: expect.objectContaining({
          env: 'production',
          service: 'rent-app',
          version: '1.2.3',
          team: 'core',
          region: 'ar=ba',
        }),
      }),
    );

    stopMock.mockResolvedValue(undefined);
    await mod.stopProfiling();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('ignores stop errors and allows re-start after shutdown', async () => {
    process.env.PYROSCOPE_SERVER_ADDRESS = 'http://pyroscope:4040';
    const mod = await import('./profiling');

    mod.startProfiling();
    stopMock.mockRejectedValue(new Error('boom'));
    await mod.stopProfiling();

    mod.startProfiling();
    expect(initMock).toHaveBeenCalledTimes(2);
  });
});
