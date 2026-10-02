import { initOtel } from "./otel";
const mockExporter = jest.fn();
const mockRegister = jest.fn();
const mockProvider = jest.fn((_options: unknown) => ({
  register: mockRegister,
}));
const mockInstrument = jest.fn();
const mockFetch = jest.fn();
const mockResource = jest.fn((value) => value);
jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: jest.fn((options: unknown) => mockExporter(options)),
}));
jest.mock("@opentelemetry/sdk-trace-web", () => ({
  WebTracerProvider: jest.fn((options: unknown) => mockProvider(options)),
}));
jest.mock("@opentelemetry/sdk-trace-base", () => ({
  BatchSpanProcessor: jest.fn((value) => value),
}));
jest.mock("@opentelemetry/instrumentation", () => ({
  registerInstrumentations: (options: unknown) => mockInstrument(options),
}));
jest.mock("@opentelemetry/instrumentation-document-load", () => ({
  DocumentLoadInstrumentation: jest.fn(),
}));
jest.mock("@opentelemetry/instrumentation-fetch", () => ({
  FetchInstrumentation: jest.fn((options: unknown) => mockFetch(options)),
}));
jest.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: (options: unknown) => mockResource(options),
}));
const environment = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...environment, NODE_ENV: "production" };
  delete process.env.CI;
  delete process.env.NEXT_PUBLIC_MOCK_MODE;
  delete process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  delete process.env.NEXT_PUBLIC_API_URL;
  delete window.__rentOtelInitialized;
  window.history.replaceState({}, "", "/");
});
afterAll(() => {
  process.env = environment;
});
function initialize() {
  initOtel();
}
it("registers one provider with explicit trace URL and headers, limiting propagation to known origins", () => {
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
    " https://collector.example/v1/traces ";
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_HEADERS =
    "Authorization=Bearer abc=def, empty=,broken,=missing, x-tenant = demo";
  process.env.NEXT_PUBLIC_API_URL = "https://api.example:8443/path";
  process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME = "rent-ui";
  process.env.NEXT_PUBLIC_APP_VERSION = "v9";
  process.env.NEXT_PUBLIC_OTEL_ENVIRONMENT = "staging";
  initialize();
  initialize();
  expect(mockExporter).toHaveBeenCalledTimes(1);
  expect(mockExporter).toHaveBeenCalledWith({
    url: "https://collector.example/v1/traces",
    headers: { Authorization: "Bearer abc=def", "x-tenant": "demo" },
  });
  expect(mockResource).toHaveBeenCalledWith(
    expect.objectContaining({
      "service.name": "rent-ui",
      "service.version": "v9",
      "deployment.environment.name": "staging",
    }),
  );
  expect(mockFetch).toHaveBeenCalledWith(
    expect.objectContaining({
      propagateTraceHeaderCorsUrls: [
        window.location.origin,
        "https://api.example:8443",
      ],
      ignoreUrls: [/\/frontend-metrics$/],
    }),
  );
  expect(mockRegister).toHaveBeenCalledTimes(1);
  expect(mockInstrument).toHaveBeenCalledTimes(1);
});
it("builds the collector path and tolerates an invalid API origin", () => {
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT =
    "https://collector.example/";
  process.env.NEXT_PUBLIC_API_URL = "invalid";
  delete process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME;
  delete process.env.NEXT_PUBLIC_APP_VERSION;
  delete process.env.npm_package_version;
  delete process.env.NEXT_PUBLIC_OTEL_ENVIRONMENT;
  initialize();
  expect(mockExporter).toHaveBeenCalledWith({
    url: "https://collector.example/v1/traces",
    headers: {},
  });
  expect(mockFetch).toHaveBeenCalledWith(
    expect.objectContaining({
      propagateTraceHeaderCorsUrls: [window.location.origin],
    }),
  );
  expect(mockResource).toHaveBeenCalledWith(
    expect.objectContaining({
      "service.name": "rent-frontend-web",
      "service.version": "0.1.0",
      "deployment.environment.name": "production",
    }),
  );
});
it.each(["missing", "callback", "mock", "test", "CI"])(
  "does not export traces when %s",
  (mode) => {
    if (mode !== "missing")
      process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT =
        "https://collector.example";
    if (mode === "callback")
      window.history.replaceState({}, "", "/es/settings/mercadolibre/callback");
    if (mode === "mock") process.env.NEXT_PUBLIC_MOCK_MODE = "true";
    if (mode === "test")
      (process.env as Record<string, string>).NODE_ENV = "test";
    if (mode === "CI") process.env.CI = "true";
    initialize();
    expect(mockExporter).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  },
);
it("uses package version when no release version is supplied", () => {
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT =
    "https://collector.example";
  delete process.env.NEXT_PUBLIC_APP_VERSION;
  process.env.npm_package_version = "2.3.4";
  initialize();
  expect(mockResource).toHaveBeenCalledWith(
    expect.objectContaining({ "service.version": "2.3.4" }),
  );
});
