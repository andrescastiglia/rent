export {};

type MockedApiClient = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

type MockedAuth = {
  getToken: jest.Mock;
};

async function loadCurrenciesApi(isMock: boolean): Promise<{
  currenciesApi: typeof import("./currencies").currenciesApi;
  apiClient: MockedApiClient;
  auth: MockedAuth;
}> {
  jest.resetModules();

  if (!isMock) {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.CI = "";
    process.env.NEXT_PUBLIC_MOCK_MODE = "";
  }

  const apiClient: MockedApiClient = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };
  const auth: MockedAuth = { getToken: jest.fn() };

  jest.doMock("../api", () => ({ apiClient }));
  jest.doMock("../auth", () => auth);

  const { currenciesApi } = await import("./currencies");

  if (!isMock) {
    (process.env as Record<string, string>).NODE_ENV = "test";
  }

  return { currenciesApi, apiClient, auth };
}

async function resolveMockDelay<T>(promise: Promise<T>): Promise<T> {
  await jest.advanceTimersByTimeAsync(200);
  return promise;
}

describe("currenciesApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── Mock mode (NODE_ENV=test) ─────────────────────────────────────────────

  describe("mock mode (NODE_ENV=test)", () => {
    describe("getAll", () => {
      it("returns all active mock currencies without calling apiClient", async () => {
        const { currenciesApi, apiClient } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getAll());
        expect(result).toHaveLength(3);
        expect(result.every((c) => c.isActive)).toBe(true);
        expect(apiClient.get).not.toHaveBeenCalled();
      });

      it("includes ARS, BRL and USD currency codes", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getAll());
        const codes = result.map((c) => c.code);
        expect(codes).toContain("ARS");
        expect(codes).toContain("BRL");
        expect(codes).toContain("USD");
      });

      it("returns objects with the expected shape (code, symbol, decimalPlaces, isActive)", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getAll());
        const usd = result.find((c) => c.code === "USD");
        expect(usd).toBeDefined();
        expect(usd?.symbol).toBe("US$");
        expect(usd?.decimalPlaces).toBe(2);
        expect(usd?.isActive).toBe(true);
      });
    });

    describe("getByCode", () => {
      it("returns the currency for a known code (uppercase input)", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getByCode("USD"));
        expect(result).not.toBeNull();
        expect(result?.code).toBe("USD");
        expect(result?.symbol).toBe("US$");
      });

      it("finds currency case-insensitively (lowercase input)", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getByCode("ars"));
        expect(result).not.toBeNull();
        expect(result?.code).toBe("ARS");
        expect(result?.symbol).toBe("$");
      });

      it("finds BRL by mixed case", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getByCode("Brl"));
        expect(result).not.toBeNull();
        expect(result?.code).toBe("BRL");
      });

      it("returns null for an unknown currency code", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(currenciesApi.getByCode("XYZ"));
        expect(result).toBeNull();
      });

      it("does not call apiClient.get in mock mode", async () => {
        const { currenciesApi, apiClient } = await loadCurrenciesApi(true);
        await resolveMockDelay(currenciesApi.getByCode("USD"));
        expect(apiClient.get).not.toHaveBeenCalled();
      });
    });

    describe("getDefaultForLocale", () => {
      it("returns ARS for locale 'es'", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(
          currenciesApi.getDefaultForLocale("es"),
        );
        expect(result.code).toBe("ARS");
      });

      it("returns BRL for locale 'pt'", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(
          currenciesApi.getDefaultForLocale("pt"),
        );
        expect(result.code).toBe("BRL");
      });

      it("returns USD for locale 'en'", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(
          currenciesApi.getDefaultForLocale("en"),
        );
        expect(result.code).toBe("USD");
      });

      it("returns USD for an unknown locale", async () => {
        const { currenciesApi } = await loadCurrenciesApi(true);
        const result = await resolveMockDelay(
          currenciesApi.getDefaultForLocale("fr"),
        );
        expect(result.code).toBe("USD");
        expect(result.symbol).toBe("US$");
      });
    });
  });

  // ─── Real API mode ─────────────────────────────────────────────────────────

  describe("real API mode (IS_MOCK_MODE=false)", () => {
    describe("getAll", () => {
      it("calls apiClient.get('/currencies', token) and returns the result", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue("token-real");
        const mockCurrencies = [
          { code: "ARS", symbol: "$", decimalPlaces: 2, isActive: true },
        ];
        apiClient.get.mockResolvedValue(mockCurrencies);

        const result = await currenciesApi.getAll();
        expect(apiClient.get).toHaveBeenCalledWith("/currencies", "token-real");
        expect(result).toEqual(mockCurrencies);
      });

      it("passes undefined as token when getToken returns null", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue(null);
        apiClient.get.mockResolvedValue([]);

        await currenciesApi.getAll();
        expect(apiClient.get).toHaveBeenCalledWith("/currencies", undefined);
      });
    });

    describe("getByCode", () => {
      it("calls apiClient.get with uppercased code and returns the currency", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue("token-real");
        const mockCurrency = {
          code: "USD",
          symbol: "US$",
          decimalPlaces: 2,
          isActive: true,
        };
        apiClient.get.mockResolvedValue(mockCurrency);

        const result = await currenciesApi.getByCode("usd");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/currencies/USD",
          "token-real",
        );
        expect(result).toEqual(mockCurrency);
      });

      it("returns null when apiClient.get throws", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockRejectedValue(new Error("Not Found"));

        const result = await currenciesApi.getByCode("XYZ");
        expect(result).toBeNull();
      });
    });

    describe("getDefaultForLocale", () => {
      it("calls apiClient.get for the locale's default currency and returns it", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue("token-real");
        const mockArs = {
          code: "ARS",
          symbol: "$",
          decimalPlaces: 2,
          isActive: true,
        };
        apiClient.get.mockResolvedValue(mockArs);

        const result = await currenciesApi.getDefaultForLocale("es");
        expect(apiClient.get).toHaveBeenCalledWith(
          "/currencies/ARS",
          "token-real",
        );
        expect(result).toEqual(mockArs);
      });

      it("returns hardcoded USD fallback when getByCode returns null (API error)", async () => {
        const { currenciesApi, apiClient, auth } =
          await loadCurrenciesApi(false);
        auth.getToken.mockReturnValue("token-real");
        apiClient.get.mockRejectedValue(new Error("Service unavailable"));

        const result = await currenciesApi.getDefaultForLocale("es");
        expect(result).toEqual({
          code: "USD",
          symbol: "US$",
          decimalPlaces: 2,
          isActive: true,
        });
      });
    });
  });
});
