export {};

const createMock = jest.fn();
const startProfilingMock = jest.fn();
const stopProfilingMock = jest.fn();
const startTracingMock = jest.fn();
const shutdownTracingMock = jest.fn();

const appMock = {
  set: jest.fn(),
  enableCors: jest.fn(),
  useGlobalPipes: jest.fn(),
  useStaticAssets: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

jest.mock('./profiling', () => ({
  startProfiling: (...args: unknown[]) => startProfilingMock(...args),
  stopProfiling: (...args: unknown[]) => stopProfilingMock(...args),
}));

jest.mock('./tracing', () => ({
  startTracing: (...args: unknown[]) => startTracingMock(...args),
  shutdownTracing: (...args: unknown[]) => shutdownTracingMock(...args),
}));

describe('main bootstrap', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    createMock.mockResolvedValue(appMock);
    appMock.listen.mockResolvedValue(undefined);
    startTracingMock.mockResolvedValue(undefined);
    stopProfilingMock.mockResolvedValue(undefined);
    shutdownTracingMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function loadMain() {
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@nestjs/core', () => ({
        NestFactory: {
          create: (...args: unknown[]) => createMock(...args),
        },
      }));
      jest.doMock('./profiling', () => ({
        startProfiling: (...args: unknown[]) => startProfilingMock(...args),
        stopProfiling: (...args: unknown[]) => stopProfilingMock(...args),
      }));
      jest.doMock('./tracing', () => ({
        startTracing: (...args: unknown[]) => startTracingMock(...args),
        shutdownTracing: (...args: unknown[]) => shutdownTracingMock(...args),
      }));
      await import('./main');
    });
  }

  it('boots app with configured CORS, pipes, static assets and listeners', async () => {
    process.env.FRONTEND_URL = 'https://a.dev, https://b.dev';
    process.env.PORT = '4100';
    process.env.HOST = '127.0.0.1';

    const onceSpy = jest
      .spyOn(process, 'once')
      .mockImplementation(((..._args: unknown[]) => process) as any);
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await loadMain();
    await new Promise((resolve) => setImmediate(resolve));

    expect(startProfilingMock).toHaveBeenCalled();
    expect(startTracingMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalled();
    expect(appMock.set).toHaveBeenCalledWith('trust proxy', 1);
    expect(appMock.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: expect.any(Function),
        credentials: true,
      }),
    );
    const corsOptions = appMock.enableCors.mock.calls[0][0];
    const originCallback = corsOptions.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => void;
    const callback = jest.fn();
    originCallback('https://a.dev', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    originCallback('http://localhost:3015', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    originCallback('http://127.0.0.1:5173', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    originCallback('http://[::1]:3000', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    originCallback(undefined, callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    originCallback('https://blocked.dev', callback);
    const blockedCall = callback.mock.calls[callback.mock.calls.length - 1];
    expect(blockedCall?.[0]).toBeInstanceOf(Error);
    expect(blockedCall?.[1]).toBeUndefined();

    expect(appMock.useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(appMock.useStaticAssets).toHaveBeenCalledWith(
      expect.stringContaining('/uploads'),
      { prefix: '/uploads/' },
    );
    expect(appMock.listen).toHaveBeenCalledWith(4100, '127.0.0.1');
    expect(logSpy).toHaveBeenCalledWith(
      'Backend running on http://127.0.0.1:4100',
    );

    expect(onceSpy).toHaveBeenCalledTimes(2);
    const registeredSignals = onceSpy.mock.calls.map((call) => call[0]);
    expect(registeredSignals).toContain('SIGTERM');
    expect(registeredSignals).toContain('SIGINT');

    const handlers = onceSpy.mock.calls.map((call) => call[1] as () => void);
    handlers.forEach((fn) => fn());
    expect(stopProfilingMock).toHaveBeenCalled();
    expect(shutdownTracingMock).toHaveBeenCalled();

    onceSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('uses default host, port and localhost CORS when env vars are absent', async () => {
    delete process.env.FRONTEND_URL;
    delete process.env.PORT;
    delete process.env.HOST;

    const onceSpy = jest
      .spyOn(process, 'once')
      .mockImplementation(((..._args: unknown[]) => process) as any);
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    await loadMain();
    await new Promise((resolve) => setImmediate(resolve));

    expect(appMock.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({ origin: expect.any(Function) }),
    );
    const corsOptions = appMock.enableCors.mock.calls[0][0];
    const originCallback = corsOptions.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => void;
    const callback = jest.fn();
    originCallback('http://localhost:3000', callback);
    expect(callback).toHaveBeenLastCalledWith(null, true);
    expect(appMock.listen).toHaveBeenCalledWith(3001, '0.0.0.0');

    onceSpy.mockRestore();
    logSpy.mockRestore();
  });
});
