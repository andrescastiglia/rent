import axios from "axios";
import { FgvService } from "./fgv.service";
import { logger } from "../../shared/logger";

jest.mock("axios");
jest.mock("../../shared/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("FgvService", () => {
  const createMock = axios.create as jest.Mock;
  const getMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    createMock.mockReturnValue({ get: getMock });
    delete process.env.BCB_API_URL;
  });

  it("builds client with default API url", () => {
    new FgvService();
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.bcb.gov.br/dados/serie",
        timeout: 30000,
      }),
    );
  });

  it("fetches and parses IGPM data", async () => {
    getMock.mockResolvedValue({
      data: [
        { data: "01/02/2025", valor: "123.40" },
        { data: "15/02/2025", valor: "125.00" },
      ],
    });

    const service = new FgvService("https://bcb.example");
    const result = await service.getIgpm(
      new Date(2025, 1, 1),
      new Date(2025, 1, 28),
    );

    expect(getMock).toHaveBeenCalledWith("/bcdata.sgs.189/dados", {
      params: {
        formato: "json",
        dataInicial: "01/02/2025",
        dataFinal: "28/02/2025",
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(123.4);
    expect(logger.info).toHaveBeenCalled();
  });

  it("returns empty when BCB has no data", async () => {
    getMock.mockResolvedValue({ data: [] });
    const service = new FgvService();

    await expect(
      service.getIgpm(new Date("2025-01-01"), new Date("2025-01-31")),
    ).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("logs and rethrows fetch errors", async () => {
    const err = new Error("network");
    getMock.mockRejectedValue(err);
    const service = new FgvService();

    await expect(
      service.getIgpm(new Date("2025-01-01"), new Date("2025-01-31")),
    ).rejects.toBe(err);
    expect(logger.error).toHaveBeenCalled();
  });

  it("getLatestIgpm returns latest sorted value or null", async () => {
    const service = new FgvService();
    const spy = jest.spyOn(service, "getIgpm");

    spy.mockResolvedValueOnce([]);
    await expect(service.getLatestIgpm()).resolves.toBeNull();

    spy.mockResolvedValueOnce([
      { date: new Date("2025-01-15"), value: 10 },
      { date: new Date("2025-02-15"), value: 20 },
    ]);
    await expect(service.getLatestIgpm()).resolves.toEqual({
      date: new Date("2025-02-15"),
      value: 20,
    });
  });

  it("covers private date helpers", () => {
    const service = new FgvService();
    const anyService = service as any;

    expect(anyService.formatDate(new Date(2025, 3, 9))).toBe("09/04/2025");
    expect(anyService.parseDate("09/04/2025")).toEqual(new Date(2025, 3, 9));
  });
});
