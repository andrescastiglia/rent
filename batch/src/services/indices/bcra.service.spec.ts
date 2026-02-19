import axios from "axios";
import { BcraService } from "./bcra.service";
import { logger } from "../../shared/logger";

jest.mock("axios");
jest.mock("../../shared/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("BcraService", () => {
  const createMock = axios.create as jest.Mock;
  const getMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockReturnValue({ get: getMock });
    delete process.env.BCRA_API_URL;
    delete process.env.BCRA_ICL_VARIABLE_ID;
    delete process.env.BCRA_API_INSECURE;
  });

  it("builds default client config and normalizes base URL", () => {
    new BcraService("https://api.bcra.gob.ar/");

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.bcra.gob.ar/estadisticas/v3.0",
        timeout: 30000,
      }),
    );
  });

  it("uses first endpoint when data is returned", async () => {
    getMock.mockResolvedValue({
      data: {
        results: [{ fecha: "2025-02-01", valor: 123.45 }],
      },
    });

    const service = new BcraService("https://x/estadisticas/v3.0");
    const result = await service.getIcl(
      new Date(Date.UTC(2025, 0, 1)),
      new Date(Date.UTC(2025, 1, 1)),
    );

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith("/monetarias/40", {
      params: { desde: "2025-01-01", hasta: "2025-02-01", limit: 5000 },
    });
    expect(result).toEqual([
      { date: new Date(Date.UTC(2025, 1, 1)), value: 123.45 },
    ]);
  });

  it("returns empty when endpoint has no results", async () => {
    getMock.mockResolvedValue({ data: { results: [] } });
    const service = new BcraService();

    const result = await service.getIcl(
      new Date("2025-01-01"),
      new Date("2025-01-31"),
    );

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("falls back to legacy endpoint after 400 and succeeds", async () => {
    const badRequest = {
      isAxiosError: true,
      response: { status: 400, data: { message: "bad" } },
    };
    getMock.mockRejectedValueOnce(badRequest).mockResolvedValueOnce({
      data: { results: [{ fecha: "01/03/2025", valor: 200 }] },
    });

    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (value: any) => Boolean(value?.isAxiosError),
    );

    const service = new BcraService();
    const result = await service.getIcl(
      new Date("2025-03-01"),
      new Date("2025-03-31"),
    );

    expect(getMock).toHaveBeenNthCalledWith(
      2,
      "/datosvariable/40/2025-03-01/2025-03-31",
      undefined,
    );
    expect(result[0].value).toBe(200);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("rethrows non-400 errors and logs details", async () => {
    const error = {
      isAxiosError: true,
      message: "boom",
      response: { status: 500, data: { detail: "x" } },
    };
    getMock.mockRejectedValue(error);

    (axios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (value: any) => Boolean(value?.isAxiosError),
    );

    const service = new BcraService();
    await expect(
      service.getIcl(new Date("2025-01-01"), new Date("2025-01-31")),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalled();
  });

  it("getLatestIcl returns latest sorted value or null", async () => {
    const service = new BcraService();
    const spy = jest.spyOn(service, "getIcl");

    spy.mockResolvedValueOnce([]);
    await expect(service.getLatestIcl()).resolves.toBeNull();

    spy.mockResolvedValueOnce([
      { date: new Date("2025-01-01"), value: 100 },
      { date: new Date("2025-02-01"), value: 150 },
    ]);
    await expect(service.getLatestIcl()).resolves.toEqual({
      date: new Date("2025-02-01"),
      value: 150,
    });
  });

  it("covers private helpers", () => {
    const service = new BcraService();
    const anyService = service as any;

    expect(anyService.parseDate("2025-04-01")).toEqual(
      new Date(Date.UTC(2025, 3, 1)),
    );
    expect(anyService.parseDate("01/04/2025")).toEqual(
      new Date(Date.UTC(2025, 3, 1)),
    );
    expect(anyService.normalizeApiUrl("https://x/estadisticas/v4.0")).toBe(
      "https://x/estadisticas/v4.0",
    );
    expect(anyService.normalizeApiUrl("https://x")).toBe(
      "https://x/estadisticas/v3.0",
    );
    expect(anyService.extractStatus(new Error("x"))).toBeUndefined();
    expect(anyService.extractResponseData(new Error("x"))).toBeUndefined();
  });
});
