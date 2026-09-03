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
