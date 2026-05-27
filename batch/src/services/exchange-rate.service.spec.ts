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

  it("fetches BCRA rates from the v4 Monetarias endpoint", async () => {
    bcraGetMock.mockResolvedValue({
      data: {
        results: [{ fecha: "2025-02-01", valor: "1234.56" }],
      },
    });

    const service = new ExchangeRateService();
    const result = await (service as any).fetchBcraRates(
      "USD",
      "ARS",
      4,
      new Date(2025, 0, 1),
      new Date(2025, 1, 1),
    );

    expect(createMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        baseURL: "https://api.bcra.gob.ar/estadisticas/v4.0",
        timeout: 30000,
      }),
    );
    expect(bcraGetMock).toHaveBeenCalledWith("/Monetarias/4", {
      params: { desde: "2025-01-01", hasta: "2025-02-01", limit: 3000 },
    });
    expect(result).toEqual([
      {
        fromCurrency: "USD",
        toCurrency: "ARS",
        rate: 1234.56,
        rateDate: new Date(2025, 1, 1),
        source: "BCRA",
      },
    ]);
  });

  it("flattens v4 detalle groups before mapping BCRA rates", async () => {
    bcraGetMock.mockResolvedValue({
      data: {
        results: [
          {
            idVariable: 4,
            detalle: [
              { fecha: "2025-02-01", valor: 1200.5 },
              { fecha: "2025-02-02", valor: "1210.75" },
            ],
          },
        ],
      },
    });

    const service = new ExchangeRateService();
    const result = await (service as any).fetchBcraRates(
      "USD",
      "ARS",
      4,
      new Date(2025, 1, 1),
      new Date(2025, 1, 2),
    );

    expect(result).toEqual([
      {
        fromCurrency: "USD",
        toCurrency: "ARS",
        rate: 1200.5,
        rateDate: new Date(2025, 1, 1),
        source: "BCRA",
      },
      {
        fromCurrency: "USD",
        toCurrency: "ARS",
        rate: 1210.75,
        rateDate: new Date(2025, 1, 2),
        source: "BCRA",
      },
    ]);
  });

  it("falls back to the legacy BCRA endpoint when v4 returns a handled error", async () => {
    const gone = {
      isAxiosError: true,
      response: { status: 410, data: { message: "gone" } },
    };
    bcraGetMock.mockRejectedValueOnce(gone).mockResolvedValueOnce({
      data: {
        results: [{ fecha: "03/02/2025", valor: "1220.25" }],
      },
    });

    const service = new ExchangeRateService();
    const result = await (service as any).fetchBcraRates(
      "BRL",
      "ARS",
      12,
      new Date(2025, 1, 3),
      new Date(2025, 1, 4),
    );

    expect(bcraGetMock).toHaveBeenNthCalledWith(1, "/Monetarias/12", {
      params: { desde: "2025-02-03", hasta: "2025-02-04", limit: 3000 },
    });
    expect(bcraGetMock).toHaveBeenNthCalledWith(
      2,
      "/datosvariable/12/2025-02-03/2025-02-04",
    );
    expect(result).toEqual([
      {
        fromCurrency: "BRL",
        toCurrency: "ARS",
        rate: 1220.25,
        rateDate: new Date(2025, 1, 3),
        source: "BCRA",
      },
    ]);
  });

  it("rethrows unhandled BCRA endpoint errors", async () => {
    const serverError = {
      isAxiosError: true,
      response: { status: 500, data: { message: "boom" } },
    };
    bcraGetMock.mockRejectedValue(serverError);

    const service = new ExchangeRateService();

    await expect(
      (service as any).fetchBcraRates(
        "USD",
        "ARS",
        4,
        new Date(2025, 1, 1),
        new Date(2025, 1, 2),
      ),
    ).rejects.toBe(serverError);
    expect(bcraGetMock).toHaveBeenCalledTimes(1);
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
      new Date(2025, 1, 1),
      new Date(2025, 1, 2),
    );
    const empty = await (service as any).fetchBcbRates(
      "USD",
      "BRL",
      1,
      new Date(2025, 1, 1),
      new Date(2025, 1, 2),
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
        rateDate: new Date(2025, 1, 1),
        source: "BCB",
      },
      {
        fromCurrency: "USD",
        toCurrency: "BRL",
        rate: 5.5,
        rateDate: new Date(2025, 1, 2),
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

    const rate = await service.getRate("USD", "ARS", new Date(2025, 1, 1));

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

    const rate = await service.getRate("USD", "ARS", new Date(2025, 1, 1));

    expect(rate).toBe(1111.11);
  });

  it("converts amount with identity rate for same currency", async () => {
    const service = new ExchangeRateService();

    const result = await service.convertAmount(
      99.99,
      "ARS",
      "ARS",
      new Date(2025, 1, 1),
    );

    expect(result).toEqual({
      amount: 99.99,
      rate: 1,
      originalAmount: 99.99,
      fromCurrency: "ARS",
      toCurrency: "ARS",
      rateDate: new Date(2025, 1, 1),
    });
  });

  it("converts amount using fetched rate", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service, "getRate").mockResolvedValue(2.3456);

    const result = await service.convertAmount(
      100,
      "USD",
      "ARS",
      new Date(2025, 1, 1),
    );

    expect(result.amount).toBe(234.56);
    expect(result.rate).toBe(2.3456);
  });

  it("throws when no API source can provide requested pair", async () => {
    const service = new ExchangeRateService();
    jest.spyOn(service as any, "fetchBcraRates").mockResolvedValue([]);
    jest.spyOn(service as any, "fetchBcbRates").mockResolvedValue([]);

    await expect(
      (service as any).fetchFromApi("EUR", "CLP", new Date(2025, 1, 1)),
    ).rejects.toThrow("No exchange rate available for EUR/CLP");
  });

  it("returns null for unsupported ARS and USD/BRL pair combinations", async () => {
    const service = new ExchangeRateService();

    await expect(
      (service as any).fetchArsPairRate("USD", "BRL", new Date(2025, 1, 1)),
    ).resolves.toBeNull();
    await expect(
      (service as any).fetchArsPairRate("EUR", "ARS", new Date(2025, 1, 1)),
    ).resolves.toBeNull();
    await expect(
      (service as any).fetchUsdBrlRate("BRL", "USD", new Date(2025, 1, 1)),
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
      rateDate: new Date(2025, 1, 1),
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
        rateDate: new Date(2025, 1, 1),
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
      fromDate: new Date(2025, 0, 1),
      toDate: new Date(2025, 0, 2),
    });
    jest.spyOn(service as any, "buildSyncGroups").mockReturnValue([
      {
        pair: "USD/ARS",
        fetcher: async () => [
          {
            fromCurrency: "USD",
            toCurrency: "ARS",
            rate: 1000,
            rateDate: new Date(2025, 0, 1),
            source: "BCRA",
          },
          {
            fromCurrency: "USD",
            toCurrency: "ARS",
            rate: 1001,
            rateDate: new Date(2025, 0, 2),
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
      new Date(2025, 1, 3),
    );
    expect((service as any).parseDateBcra("03/02/2025")).toEqual(
      new Date(2025, 1, 3),
    );
    expect((service as any).parseDateBcb("04/02/2025")).toEqual(
      new Date(2025, 1, 4),
    );
  });

  it("recognizes handled and unhandled axios statuses", () => {
    const service = new ExchangeRateService();

    expect(
      (service as any).isNotFoundOrBadRequest({
        isAxiosError: true,
        response: { status: 404 },
      }),
    ).toBe(true);
    expect(
      (service as any).extractStatus({
        isAxiosError: true,
        response: { status: 400 },
      }),
    ).toBe(400);
    expect(
      (service as any).extractResponseData({
        isAxiosError: true,
        response: { data: { detail: "x" } },
      }),
    ).toEqual({ detail: "x" });

    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
    expect((service as any).isNotFoundOrBadRequest(new Error("x"))).toBe(false);
    expect((service as any).extractStatus(new Error("x"))).toBeUndefined();
    expect(
      (service as any).extractResponseData(new Error("x")),
    ).toBeUndefined();
  });
});
