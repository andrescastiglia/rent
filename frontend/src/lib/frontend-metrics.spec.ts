const originalFetchForTelemetry = globalThis.fetch;
const metricsEnv = process.env.NODE_ENV;
import { setToken } from "@/lib/auth";
import { reportClientError } from "@/lib/frontend-metrics";

describe("frontend metrics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalMockMode = process.env.NEXT_PUBLIC_MOCK_MODE;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV =
      originalNodeEnv;
    process.env.NEXT_PUBLIC_MOCK_MODE = originalMockMode;
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("does not send telemetry from mock E2E sessions", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_MOCK_MODE = "true";
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
    setToken("mock-token-1");

    reportClientError("error", "/es/tenants");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it("normalizes paths and units without leaking record IDs into telemetry", async () => {
  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.NEXT_PUBLIC_MOCK_MODE = "";
  setToken("jwt");
  const fetchMock = jest.fn().mockResolvedValue({});
  globalThis.fetch = fetchMock;
  const { reportWebVital, reportApiError, getCurrentPath } =
    await import("./frontend-metrics");
  window.history.replaceState({}, "", "/es/properties/123");
  reportWebVital("LCP", 2500, "/es/properties/123");
  reportWebVital(
    "CLS",
    0.1,
    "/es/properties/123e4567-e89b-42d3-a456-426614174000",
  );
  reportApiError({
    method: "post",
    endpoint: "/payments/123",
    statusCode: 409,
  });
  reportClientError("", "");
  expect(getCurrentPath()).toBe("/es/properties/:id");
  const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
  expect(bodies).toEqual([
    { type: "web_vital", name: "LCP", value: 2.5, path: "/es/properties/:id" },
    { type: "web_vital", name: "CLS", value: 0.1, path: "/es/properties/:id" },
    {
      type: "api_error",
      method: "POST",
      endpoint: "/payments/:id",
      statusCode: 409,
      path: "/es/properties/:id",
    },
    { type: "client_error", errorType: "unknown", path: "/unknown" },
  ]);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/frontend-metrics"),
    expect.objectContaining({
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer jwt",
      },
    }),
  );
  globalThis.fetch = jest.fn().mockRejectedValue(new Error("offline"));
  reportClientError("render");
  await Promise.resolve();
  localStorage.clear();
  const none = jest.fn();
  globalThis.fetch = none;
  reportClientError("render");
  expect(none).not.toHaveBeenCalled();
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  globalThis.fetch = originalFetchForTelemetry;
  (process.env as Record<string, string | undefined>).NODE_ENV = metricsEnv;
});
