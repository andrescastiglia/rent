import {
  authorizationDestination,
  mercadoLibreApi,
  readAuthorizationCallback,
} from "./mercadolibre";
import { apiClient } from "../api";
import { getToken } from "../auth";
jest.mock("../api", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock("../auth", () => ({ getToken: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
it.each(["token", null])(
  "uses authenticated internal endpoints (%s)",
  async (token) => {
    jest.mocked(getToken).mockReturnValue(token);
    await mercadoLibreApi.status();
    await mercadoLibreApi.begin();
    await mercadoLibreApi.complete({ code: "code", state: "state" });
    await mercadoLibreApi.disconnect();
    expect(apiClient.get).toHaveBeenCalledWith(
      "/integrations/mercadolibre/status",
      token || undefined,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/integrations/mercadolibre/authorization",
      {},
      token || undefined,
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/integrations/mercadolibre/authorization/complete",
      { code: "code", state: "state" },
      token || undefined,
    );
    expect(apiClient.delete).toHaveBeenCalledWith(
      "/integrations/mercadolibre/connection",
      token || undefined,
    );
  },
);
it("accepts only the provider authorization destination", () => {
  const url = "https://auth.mercadolibre.com.ar/authorization?state=test";
  expect(authorizationDestination(url)).toBe(url);
});
it.each([
  "javascript:alert(1)",
  "https://evil.test/authorization",
  "https://auth.mercadolibre.com.ar.evil.test/authorization",
  "https://user@auth.mercadolibre.com.ar/authorization",
  "https://auth.mercadolibre.com.ar/other",
  "https://auth.mercadolibre.com.ar/authorization#secret",
])("rejects unsafe destinations: %s", (url) => {
  expect(() => authorizationDestination(url)).toThrow();
});
it("reads one valid code and state without interpreting provider content", () => {
  expect(
    readAuthorizationCallback(`?code=secret&state=${"a".repeat(43)}`),
  ).toEqual({ code: "secret", state: "a".repeat(43) });
});
it.each([
  "",
  "?error=denied",
  "?code=one&state=short",
  `?code=one&code=two&state=${"a".repeat(43)}`,
  `?code=one&state=${"a".repeat(43)}&state=other`,
  `?code=${"a".repeat(2049)}&state=${"a".repeat(43)}`,
])("rejects invalid callbacks", (search) => {
  expect(readAuthorizationCallback(search)).toBeNull();
});
