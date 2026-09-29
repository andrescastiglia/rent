import { IndicesSyncService } from "./indices-sync.service";
import { BcraService } from "./indices/bcra.service";
import { IpcArService } from "./indices/ipc-ar.service";
import { FgvService } from "./indices/fgv.service";
import { InflationObservationsService } from "./inflation-observations.service";

jest.mock("../shared/database", () => ({ AppDataSource: {} }));
jest.mock("../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

describe("IndicesSyncService", () => {
  const source = {
    source: "fixture",
    series: "test",
    url: "https://example.test/series",
  };
  const getIcl = jest.fn(),
    getIpc = jest.fn(),
    getIgpm = jest.fn();
  const latestDate = jest.fn(),
    store = jest.fn();
  const service = new IndicesSyncService(
    { getIcl, provenance: () => source } as unknown as BcraService,
    { getIpc, provenance: () => source } as unknown as IpcArService,
    { getIgpm, provenance: () => source } as unknown as FgvService,
    { latestDate, store } as unknown as InflationObservationsService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    latestDate.mockResolvedValue(null);
    for (const fn of [getIcl, getIpc, getIgpm]) fn.mockResolvedValue([]);
    store.mockImplementation(async (_index, points) => ({
      inserted: points.length,
      skipped: 0,
    }));
  });
  it("keeps every daily ICL observation and bounded non-overlapping windows", async () => {
    const points = [
      { date: new Date("2025-01-01"), value: 21.54 },
      { date: new Date("2025-01-02"), value: 21.57 },
    ];
    getIcl
      .mockResolvedValueOnce(points)
      .mockResolvedValueOnce([{ date: new Date("2025-04-01"), value: 24 }]);
    const result = await service.syncIcl({
      fromDate: "2025-01-01",
      toDate: "2025-04-02",
    });
    expect(getIcl.mock.calls).toEqual([
      [new Date("2025-01-01"), new Date("2025-03-31")],
      [new Date("2025-04-01"), new Date("2025-04-02")],
    ]);
    expect(store).toHaveBeenCalledWith(
      "icl",
      [...points, { date: new Date("2025-04-01"), value: 24 }],
      source,
      expect.any(Date),
    );
    expect(result.recordsInserted).toBe(3);
  });
  it("does not advance the journal when a later window fails", async () => {
    getIcl
      .mockResolvedValueOnce([{ date: new Date("2025-01-01"), value: 1 }])
      .mockRejectedValueOnce(new Error("timeout"));
    await expect(
      service.syncIcl({ fromDate: "2025-01-01", toDate: "2025-04-02" }),
    ).rejects.toThrow("timeout");
    expect(store).not.toHaveBeenCalled();
  });
  it("isolates provider failures while also synchronizing IGP-M", async () => {
    getIpc.mockRejectedValue(new Error("IPC unavailable"));
    getIgpm.mockResolvedValue([{ date: new Date("2025-03-01"), value: -0.34 }]);
    const results = await service.syncAll({
      fromDate: "2025-03-01",
      toDate: "2025-03-31",
    });
    expect(
      results.map((result) => [
        result.indexType,
        result.recordsInserted,
        result.error,
      ]),
    ).toEqual([
      ["icl", 0, undefined],
      ["ipc", 0, "IPC unavailable"],
      ["igp_m", 1, undefined],
    ]);
  });
  it("refetches overlapping history from the new journal and normalizes monthly starts", async () => {
    latestDate.mockResolvedValue(new Date("2025-03-01"));
    await service.syncIpc({ toDate: "2025-03-31" });
    expect(getIpc).toHaveBeenCalledWith(
      new Date("2024-12-01"),
      new Date("2025-03-31"),
    );
  });
  it("rejects out-of-range provider data before persistence", async () => {
    getIcl.mockResolvedValue([{ date: new Date("2026-01-01"), value: 1 }]);
    await expect(
      service.syncIcl({ fromDate: "2025-01-01", toDate: "2025-01-31" }),
    ).rejects.toThrow("outside");
    expect(store).not.toHaveBeenCalled();
  });
  it.each([
    { fromDate: "2025-02-30" },
    { fromDate: "2025-02-01", toDate: "2025-01-01" },
  ])("rejects invalid requested ranges", async (range) => {
    await expect(service.syncIcl(range)).rejects.toThrow();
    expect(getIcl).not.toHaveBeenCalled();
  });
});
