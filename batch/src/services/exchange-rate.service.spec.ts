import axios from "axios";
import { ExchangeRateService } from "./exchange-rate.service";
import { AppDataSource } from "../shared/database";

jest.mock("axios");
jest.mock("../shared/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("ExchangeRateService", () => {
  const createMock = axios.create as jest.Mock;
  const bcraGetMock = jest.fn();
  const bcbGetMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockReset();
    createMock
      .mockReturnValueOnce({ get: bcraGetMock })
      .mockReturnValueOnce({ get: bcbGetMock });
    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (value: any) => Boolean(value?.isAxiosError),
    );
    delete process.env.BCRA_EXCHANGE_RATE_API_URL;
    delete process.env.BCB_API_URL;
    delete process.env.BCRA_API_INSECURE;
    delete process.env.BCB_API_INSECURE;
  });

  it.each(["USD", "BRL"])(
    "fetches %s/ARS from the configured currency API",
    async (currency) => {
      process.env.BCRA_EXCHANGE_RATE_API_URL =
        "https://api.bcra.gob.ar/estadisticascambiarias/v1.0";
      bcraGetMock.mockResolvedValue({
        data: {
          status: 200,
          metadata: { resultset: { count: 2 } },
          results: [
            {
              fecha: "2026-10-02",
              detalle: [
                { codigoMoneda: currency, tipoCotizacion: "291.08179" },
              ],
            },
            {
              fecha: "2026-10-01",
              detalle: [{ codigoMoneda: currency, tipoCotizacion: 291.547141 }],
            },
          ],
        },
      });
      const service = new ExchangeRateService();
      const result = await (service as any).fetchBcraRates(
        currency,
        "ARS",
        new Date(Date.UTC(2026, 9, 1)),
        new Date(Date.UTC(2026, 9, 2)),
      );
      expect(createMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          baseURL: process.env.BCRA_EXCHANGE_RATE_API_URL,
        }),
      );
      expect(bcraGetMock).toHaveBeenCalledWith(`/Cotizaciones/${currency}`, {
        params: {
          fechaDesde: "2026-10-01",
          fechaHasta: "2026-10-02",
          limit: 1000,
        },
      });
      expect(result).toEqual([
        {
          fromCurrency: currency,
          toCurrency: "ARS",
          rate: 291.08179,
          rateDate: new Date(Date.UTC(2026, 9, 2)),
          source: "BCRA",
        },
        {
          fromCurrency: currency,
          toCurrency: "ARS",
          rate: 291.547141,
          rateDate: new Date(Date.UTC(2026, 9, 1)),
          source: "BCRA",
        },
      ]);
    },
  );

  it.each([
    { status: 500, results: [] },
    { status: 200, results: null },
    { status: 200, metadata: { resultset: { count: 2 } }, results: [] },
    {
      status: 200,
      results: [
        {
          fecha: "2026-10-02",
          detalle: [{ codigoMoneda: "BRL", tipoCotizacion: 300 }],
        },
      ],
    },
    {
      status: 200,
      results: [
        {
          fecha: "2026-10-02",
          detalle: [{ codigoMoneda: "USD", tipoCotizacion: 0 }],
        },
      ],
    },
    {
      status: 200,
      results: [
        {
          fecha: "invalid",
          detalle: [{ codigoMoneda: "USD", tipoCotizacion: 100 }],
        },
      ],
    },
  ])(
    "rejects malformed, wrong-currency or incomplete BCRA payloads",
    async (data) => {
      bcraGetMock.mockResolvedValue({ data });
      const service = new ExchangeRateService();
      await expect(
        (service as any).fetchBcraRates(
          "USD",
          "ARS",
          new Date(Date.UTC(2026, 9, 1)),
          new Date(Date.UTC(2026, 9, 2)),
        ),
      ).rejects.toThrow();
    },
  );

  it("preserves provider failures without querying an unrelated monetary series", async () => {
    bcraGetMock.mockRejectedValue(new Error("HTTP 404"));
    const service = new ExchangeRateService();
    await expect(
      (service as any).fetchBcraRates(
        "BRL",
        "ARS",
        new Date(Date.UTC(2026, 9, 1)),
        new Date(Date.UTC(2026, 9, 2)),
      ),
    ).rejects.toThrow("HTTP 404");
    expect(bcraGetMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes the documented BCB host-only configuration", () => {
    process.env.BCB_API_URL = "https://api.bcb.gov.br/";
    new ExchangeRateService();
    expect(createMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        baseURL: "https://api.bcb.gov.br/dados/serie",
      }),
    );
  });

  it("maps BCB rates and returns empty list when payload has no rows", async () => {
    bcbGetMock
      .mockResolvedValueOnce({
        data: [
          { data: "01/02/2025", valor: "5.42" },
          { data: "02/02/2025", valor: "5.5" },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const service = new ExchangeRateService();
    const mapped = await (service as any).fetchBcbRates(
      "USD",
      "BRL",
      1,
      new Date(Date.UTC(2025, 1, 1)),
      new Date(Date.UTC(2025, 1, 2)),
    );
    const empty = await (service as any).fetchBcbRates(
      "USD",
      "BRL",
      1,
      new Date(Date.UTC(2025, 1, 1)),
      new Date(Date.UTC(2025, 1, 2)),
    );

    expect(bcbGetMock).toHaveBeenNthCalledWith(1, "/bcdata.sgs.1/dados", {
      params: {
        formato: "json",
        dataInicial: "01/02/2025",
        dataFinal: "02/02/2025",
      },
    });
    expect(mapped).toEqual([
      {
        fromCurrency: "USD",
        toCurrency: "BRL",
        rate: 5.42,
        rateDate: new Date(Date.UTC(2025, 1, 1)),
        source: "BCB",
      },
      {
        fromCurrency: "USD",
        toCurrency: "BRL",
        rate: 5.5,
        rateDate: new Date(Date.UTC(2025, 1, 2)),
        source: "BCB",
      },
    ]);
    expect(empty).toEqual([]);
  });

  it("uses cached rate when available", async () => {
    const querySpy = jest
      .spyOn(AppDataSource, "query")
      .mockResolvedValueOnce([{ rate: "1000.10" }]);
    const service = new ExchangeRateService();
    const fetchSpy = jest.spyOn(service as any, "fetchFromApi");
    const saveSpy = jest.spyOn(service as any, "saveRate");

    const rate = await service.getRate(
      "USD",
      "ARS",
      new Date(Date.UTC(2025, 1, 1)),
    );

    expect(rate).toBe(1000.1);
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("fetches and saves rate when cache is empty", async () => {
    jest
      .spyOn(AppDataSource, "query")
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ inserted: true }]);
    const service = new ExchangeRateService();
    jest.spyOn(service as any, "fetchFromApi").mockResolvedValue(1111.11);

    const rate = await service.getRate(
      "USD",
      "ARS",
      new Date(Date.UTC(2025, 1, 1)),
    );

    expect(rate).toBe(1111.11);
  });

  it("converts amount with identity rate for same currency", async () => {
    const service = new ExchangeRateService();

    const result = await service.convertAmount(
      99.99,
      "ARS",
      "ARS",
      new Date(Date.UTC(2025, 1, 1)),
    );

    expect(result).toEqual({
      amount: 99.99,
      rate: 1,
      originalAmount: 99.99,
      fromCurrency: "ARS",
      toCurrency: "ARS",
      rateDate: new Date(Date.UTC(2025, 1, 1)),
    });
  });

  it("converts amount using fetched rate", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service, "getRate").mockResolvedValue(2.3456);

    const result = await service.convertAmount(
      100,
      "USD",
      "ARS",
      new Date(Date.UTC(2025, 1, 1)),
    );

    expect(result.amount).toBe(234.56);
    expect(result.rate).toBe(2.3456);
  });

  it("throws when no API source can provide requested pair", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service as any, "fetchBcraRates").mockResolvedValue([]);
    jest.spyOn(service as any, "fetchBcbRates").mockResolvedValue([]);

    await expect(
      (service as any).fetchFromApi(
        "EUR",
        "CLP",
        new Date(Date.UTC(2025, 1, 1)),
      ),
    ).rejects.toThrow("No exchange rate available for EUR/CLP");
  });

  it("returns null for unsupported ARS and USD/BRL pair combinations", async () => {
    const service = new ExchangeRateService();

    await expect(
      (service as any).fetchArsPairRate(
        "USD",
        "BRL",
        new Date(Date.UTC(2025, 1, 1)),
      ),
    ).resolves.toBeNull();
    await expect(
      (service as any).fetchArsPairRate(
        "EUR",
        "ARS",
        new Date(Date.UTC(2025, 1, 1)),
      ),
    ).resolves.toBeNull();
    await expect(
      (service as any).fetchUsdBrlRate(
        "BRL",
        "USD",
        new Date(Date.UTC(2025, 1, 1)),
      ),
    ).resolves.toBeNull();
  });

  it("upserts exchange rate and returns inserted flag", async () => {
    const querySpy = jest
      .spyOn(AppDataSource, "query")
      .mockResolvedValueOnce([{ inserted: true }])
      .mockResolvedValueOnce([{ inserted: false }]);
    const service = new ExchangeRateService();
    const payload = {
      fromCurrency: "USD",
      toCurrency: "ARS",
      rate: 1200,
      rateDate: new Date(Date.UTC(2025, 1, 1)),
      source: "BCRA",
    };

    await expect((service as any).upsertRate(payload)).resolves.toBe(true);
    await expect((service as any).upsertRate(payload)).resolves.toBe(false);
    expect(querySpy).toHaveBeenCalledTimes(2);
  });

  it("propagates upsert errors", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(AppDataSource, "query").mockRejectedValue(new Error("db down"));

    await expect(
      (service as any).upsertRate({
        fromCurrency: "USD",
        toCurrency: "ARS",
        rate: 1,
        rateDate: new Date(Date.UTC(2025, 1, 1)),
        source: "API",
      }),
    ).rejects.toThrow("db down");
  });

  it("collects errors when a sync group fails", async () => {
    const service = new ExchangeRateService();
    const summary = { processed: 0, inserted: 0, errors: [] as string[] };

    await (service as any).syncRateGroup(
      () => Promise.reject(new Error("network timeout")),
      "USD/ARS",
      summary,
    );

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain("USD/ARS sync failed: network timeout");
  });

  it("runs syncRates over provided groups and counts inserts", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service as any, "getSyncDateRange").mockReturnValue({
      fromDate: new Date(Date.UTC(2025, 0, 1)),
      toDate: new Date(Date.UTC(2025, 0, 2)),
    });
    jest.spyOn(service as any, "buildSyncGroups").mockReturnValue([
      {
        pair: "USD/ARS",
        fetcher: async () => [
          {
            fromCurrency: "USD",
            toCurrency: "ARS",
            rate: 1000,
            rateDate: new Date(Date.UTC(2025, 0, 1)),
            source: "BCRA",
          },
          {
            fromCurrency: "USD",
            toCurrency: "ARS",
            rate: 1001,
            rateDate: new Date(Date.UTC(2025, 0, 2)),
            source: "BCRA",
          },
        ],
      },
    ]);
    jest
      .spyOn(service as any, "upsertRate")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const summary = await service.syncRates();

    expect(summary).toEqual({ processed: 2, inserted: 1, errors: [] });
  });

  it("parses BCRA and BCB date formats", () => {
    const service = new ExchangeRateService();

    expect((service as any).parseDateBcra("2025-02-03")).toEqual(
      new Date(Date.UTC(2025, 1, 3)),
    );
    expect((service as any).parseDateBcra("03/02/2025")).toEqual(
      new Date(Date.UTC(2025, 1, 3)),
    );
    expect((service as any).parseDateBcb("04/02/2025")).toEqual(
      new Date(Date.UTC(2025, 1, 4)),
    );
  });

  it("validates rates in dry-run without any accounting writes", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service as any, "buildSyncGroups").mockReturnValue([
      {
        pair: "USD/ARS",
        fetcher: async () => [
          {
            fromCurrency: "USD",
            toCurrency: "ARS",
            rate: 1520,
            rateDate: new Date(Date.UTC(2026, 9, 2)),
            source: "BCRA",
          },
        ],
      },
    ]);
    const write = jest.spyOn(service as any, "upsertRate");
    expect(await service.syncRates(true)).toEqual({
      processed: 1,
      inserted: 0,
      errors: [],
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("records an empty provider response as a failed pair", async () => {
    const service = new ExchangeRateService();
    const summary = { processed: 0, inserted: 0, errors: [] as string[] };
    await (service as any).syncRateGroup(
      async () => [],
      "BRL/ARS",
      summary,
      true,
    );
    expect(summary.errors).toEqual([
      "BRL/ARS sync failed: Provider returned no exchange rates",
    ]);
  });

  it.each([
    { data: "02/10/2026", valor: "NaN" },
    { data: "02/10/2026", valor: "-1" },
  ])("rejects malformed BCB observations", async (row) => {
    bcbGetMock.mockResolvedValue({ data: [row] });
    const service = new ExchangeRateService();
    await expect(
      (service as any).fetchBcbRates(
        "USD",
        "BRL",
        1,
        new Date(Date.UTC(2026, 9, 1)),
        new Date(Date.UTC(2026, 9, 2)),
      ),
    ).rejects.toThrow("Invalid BCB");
  });
});
