import axios from "axios";
import { ExchangeRateService } from "./exchange-rate.service";

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
});
