const mockStart = jest.fn();
const mockShutdown = jest.fn();
const mockSdk = jest
  .fn()
  .mockImplementation(() => ({ start: mockStart, shutdown: mockShutdown }));
const mockExporter = jest.fn();
const mockResource = jest.fn((attributes) => attributes);
const mockInstruments = jest.fn();
const mockDiagLogger = jest.fn();
jest.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: mockSdk }));
jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: mockExporter,
}));
jest.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: mockResource,
}));
jest.mock("@opentelemetry/auto-instrumentations-node", () => ({
  getNodeAutoInstrumentations: mockInstruments,
}));
jest.mock("@opentelemetry/api", () => ({
  diag: { setLogger: mockDiagLogger },
  DiagConsoleLogger: jest.fn(),
  DiagLogLevel: { DEBUG: "debug" },
}));

describe("batch tracing lifecycle", () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockShutdown.mockResolvedValue(undefined);
    process.env = { ...env };
    for (const key of Object.keys(process.env))
      if (key.startsWith("OTEL_")) delete process.env[key];
    delete process.env.npm_package_version;
    delete process.env.NODE_ENV;
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("does not create a SDK without a destination or when disabled", async () => {
    const tracing = await import("./tracing");
    await tracing.startTracing();
    await tracing.shutdownTracing();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://collector";
    process.env.OTEL_SDK_DISABLED = "true";
    await tracing.startTracing();
    expect(mockSdk).not.toHaveBeenCalled();
    expect(mockShutdown).not.toHaveBeenCalled();
  });

  it("uses explicit trace URL, parses headers and starts only once until shutdown", async () => {
    Object.assign(process.env, {
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: " https://collector/traces ",
      OTEL_EXPORTER_OTLP_ENDPOINT: "https://ignored",
      OTEL_EXPORTER_OTLP_HEADERS:
        " token=a=b, empty=, =bad,invalid, , tenant = x ",
      OTEL_SERVICE_NAME_BATCH: "batch-custom",
      OTEL_SERVICE_NAME: "ignored",
      npm_package_version: "2.0",
      OTEL_ENVIRONMENT: "staging",
      OTEL_LOG_LEVEL: "debug",
    });
    const tracing = await import("./tracing");
    await tracing.startTracing();
    await tracing.startTracing();
    expect(mockSdk).toHaveBeenCalledTimes(1);
    expect(mockExporter).toHaveBeenCalledWith({
      url: "https://collector/traces",
      headers: { token: "a=b", tenant: "x" },
    });
    expect(mockResource).toHaveBeenCalledWith(
      expect.objectContaining({
        "service.name": "batch-custom",
        "service.version": "2.0",
        "deployment.environment.name": "staging",
      }),
    );
    expect(mockDiagLogger).toHaveBeenCalled();
    expect(mockInstruments).toHaveBeenCalledWith({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    });
    await tracing.shutdownTracing();
    await tracing.startTracing();
    await tracing.shutdownTracing();
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockShutdown).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["https://collector/", undefined, undefined, "rent-batch", "development"],
    [
      "https://collector",
      "shared-service",
      "production",
      "shared-service",
      "production",
    ],
  ])(
    "derives HTTP trace URL and resolves fallback resource metadata",
    async (endpoint, service, nodeEnv, name, environment) => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
      if (service) process.env.OTEL_SERVICE_NAME = service;
      if (nodeEnv) process.env.NODE_ENV = nodeEnv;
      const tracing = await import("./tracing");
      await tracing.startTracing();
      expect(mockExporter).toHaveBeenCalledWith({
        url: "https://collector/v1/traces",
        headers: {},
      });
      expect(mockResource).toHaveBeenCalledWith(
        expect.objectContaining({
          "service.name": name,
          "service.version": "1.0.0",
          "deployment.environment.name": environment,
        }),
      );
      mockShutdown.mockRejectedValue(new Error("collector unavailable"));
      await expect(tracing.shutdownTracing()).resolves.toBeUndefined();
      await tracing.shutdownTracing();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    },
  );
});
