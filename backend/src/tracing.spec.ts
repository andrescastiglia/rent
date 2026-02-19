export {};

const originalEnv = process.env;

const setLoggerMock = jest.fn();
const sdkStartMock = jest.fn();
const sdkShutdownMock = jest.fn();
const nodeSdkCtorMock = jest.fn();
const exporterCtorMock = jest.fn();
const resourceFromAttributesMock = jest.fn((attrs) => ({ attrs }));
const getInstrumentationsMock = jest.fn((_opts?: unknown) => ['auto']);

jest.mock('@opentelemetry/api', () => ({
  diag: { setLogger: (...args: unknown[]) => setLoggerMock(...args) },
  DiagConsoleLogger: class {},
  DiagLogLevel: { DEBUG: 'debug' },
}));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(opts: unknown) {
      nodeSdkCtorMock(opts);
    }
    start(...args: unknown[]) {
      return sdkStartMock(...args);
    }
    shutdown(...args: unknown[]) {
      return sdkShutdownMock(...args);
    }
  },
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class {
    constructor(opts: unknown) {
      exporterCtorMock(opts);
      return { opts };
    }
  },
}));

jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: (attrs: unknown) => resourceFromAttributesMock(attrs),
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (opts: unknown) => getInstrumentationsMock(opts),
}));

describe('tracing', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OTEL_SDK_DISABLED;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    delete process.env.OTEL_LOG_LEVEL;
    delete process.env.OTEL_SERVICE_NAME_BACKEND;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_ENVIRONMENT;
    delete process.env.NODE_ENV;
    delete process.env.npm_package_version;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not start when disabled or endpoint is missing', async () => {
    process.env.OTEL_SDK_DISABLED = 'true';
    let mod = await import('./tracing');
    await mod.startTracing();
    expect(nodeSdkCtorMock).not.toHaveBeenCalled();

    jest.resetModules();
    process.env = { ...originalEnv };
    mod = await import('./tracing');
    await mod.startTracing();
    expect(nodeSdkCtorMock).not.toHaveBeenCalled();
  });

  it('starts with traces endpoint, parses headers and enables debug logger', async () => {
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://otel:4318/custom';
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'a=1, invalid, b=,c=hello=world';
    process.env.OTEL_LOG_LEVEL = 'debug';
    process.env.OTEL_SERVICE_NAME = 'rent-service';
    process.env.OTEL_ENVIRONMENT = 'staging';
    process.env.npm_package_version = '9.9.9';

    sdkStartMock.mockResolvedValue(undefined);
    const mod = await import('./tracing');
    await mod.startTracing();
    await mod.startTracing();

    expect(setLoggerMock).toHaveBeenCalledTimes(1);
    expect(nodeSdkCtorMock).toHaveBeenCalledTimes(1);
    expect(exporterCtorMock).toHaveBeenCalledWith({
      url: 'http://otel:4318/custom',
      headers: { a: '1', c: 'hello=world' },
    });
    expect(resourceFromAttributesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        'service.name': 'rent-service',
        'service.version': '9.9.9',
        'deployment.environment': 'staging',
      }),
    );
    expect(getInstrumentationsMock).toHaveBeenCalledWith({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    });
    expect(sdkStartMock).toHaveBeenCalledTimes(1);
  });

  it('builds traces URL from OTLP endpoint and shuts down safely', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318/';
    sdkStartMock.mockResolvedValue(undefined);

    const mod = await import('./tracing');
    await mod.startTracing();

    expect(exporterCtorMock).toHaveBeenCalledWith({
      url: 'http://otel:4318/v1/traces',
      headers: {},
    });

    sdkShutdownMock.mockRejectedValue(new Error('shutdown failed'));
    await mod.shutdownTracing();
    expect(sdkShutdownMock).toHaveBeenCalledTimes(1);

    sdkStartMock.mockResolvedValue(undefined);
    await mod.startTracing();
    expect(nodeSdkCtorMock).toHaveBeenCalledTimes(2);
  });

  it('shutdown is no-op when sdk was never started', async () => {
    const mod = await import('./tracing');
    await mod.shutdownTracing();
    expect(sdkShutdownMock).not.toHaveBeenCalled();
  });
});
