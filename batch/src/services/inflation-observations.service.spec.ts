import { AppDataSource } from "../shared/database";
import { InflationObservationsService } from "./inflation-observations.service";

jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn(), transaction: jest.fn() },
}));

describe("InflationObservationsService", () => {
  const query = jest.fn();
  const journal = new InflationObservationsService();
  const source = {
    source: "BCRA",
    series: "BCRA:40",
    url: "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/40",
  };
  const date = new Date("2025-01-01"),
    retrieved = new Date("2025-02-01");
  const old = {
    date: "2025-01-01",
    value: "1.1000000000",
    revision: 1,
    value_kind: "level",
    source: source.source,
    source_series: source.series,
    source_url: source.url,
    retrieved_at: retrieved,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    (AppDataSource.transaction as jest.Mock).mockImplementation(
      async (callback) => callback({ query }),
    );
    query.mockImplementation(async (sql) =>
      sql.startsWith("SELECT DISTINCT") ? [] : undefined,
    );
  });
  it("gets only the journal watermark and allows an empty journal", async () => {
    (AppDataSource.query as jest.Mock)
      .mockResolvedValueOnce([{ latest: null }])
      .mockResolvedValueOnce([{ latest: "2025-01-01" }]);
    await expect(journal.latestDate("icl")).resolves.toBeNull();
    await expect(journal.latestDate("icl")).resolves.toEqual(date);
  });
  it("deduplicates equal dates within the fetched series", async () => {
    const point = { date, value: 1.1 };
    await expect(
      journal.store("icl", [point, point], source, retrieved),
    ).resolves.toEqual({ inserted: 1, skipped: 0 });
    expect(
      query.mock.calls.filter(([sql]) => sql.startsWith("INSERT")),
    ).toHaveLength(1);
  });
  it("skips identical or older observations but appends changed provenance/value", async () => {
    query.mockImplementation(async (sql) =>
      sql.startsWith("SELECT DISTINCT") ? [old] : undefined,
    );
    await expect(
      journal.store("icl", [{ date, value: 1.1 }], source, retrieved),
    ).resolves.toEqual({ inserted: 0, skipped: 1 });
    await expect(
      journal.store(
        "icl",
        [{ date, value: 5 }],
        source,
        new Date("2025-01-31"),
      ),
    ).resolves.toEqual({ inserted: 0, skipped: 1 });
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
      false,
    );
    await expect(
      journal.store("icl", [{ date, value: 1.2 }], source, retrieved),
    ).resolves.toEqual({ inserted: 1, skipped: 0 });
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("INSERT"), [
      "icl",
      "2025-01-01",
      "1.2000000000",
      "level",
      source.source,
      source.series,
      source.url,
      2,
      retrieved,
    ]);
    await expect(
      journal.store(
        "icl",
        [{ date, value: 1.1 }],
        { ...source, url: "https://example.test/corrected-source" },
        retrieved,
      ),
    ).resolves.toEqual({ inserted: 1, skipped: 0 });
  });
  it("stores deflation as monthly percent and leaves empty series alone", async () => {
    await expect(
      journal.store("igp_m", [{ date, value: -0.34 }], source, retrieved),
    ).resolves.toEqual({ inserted: 1, skipped: 0 });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT"),
      expect.arrayContaining(["monthly_percent", "-0.3400000000"]),
    );
    (AppDataSource.transaction as jest.Mock).mockClear();
    await expect(journal.store("ipc", [], source, retrieved)).resolves.toEqual({
      inserted: 0,
      skipped: 0,
    });
    expect(AppDataSource.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { date: new Date("invalid"), value: 1 },
    { date, value: NaN },
    { date, value: Infinity },
    { date, value: 1e10 },
    { date, value: 0 },
    { date, value: -1 },
    { date: new Date("2025-01-02"), value: 1 },
  ])(
    "rejects invalid monthly observations before starting a write",
    async (point) => {
      await expect(
        journal.store("ipc", [point], source, retrieved),
      ).rejects.toThrow("Invalid inflation");
      expect(AppDataSource.transaction).not.toHaveBeenCalled();
    },
  );
  it("rejects impossible percentage and conflicting duplicate dates", async () => {
    await expect(
      journal.store("igp_m", [{ date, value: -100 }], source, retrieved),
    ).rejects.toThrow();
    await expect(
      journal.store(
        "icl",
        [
          { date, value: 1 },
          { date, value: 2 },
        ],
        source,
        retrieved,
      ),
    ).rejects.toThrow("Conflicting");
  });
  it("requires provenance and a valid retrieval time", async () => {
    for (const key of ["source", "series", "url"]) {
      await expect(
        journal.store("icl", [], { ...source, [key]: "" }, retrieved),
      ).rejects.toThrow("provenance");
    }
    await expect(
      journal.store("icl", [], source, new Date("invalid")),
    ).rejects.toThrow("provenance");
  });
  it("propagates transaction failure so the job cannot report success", async () => {
    (AppDataSource.transaction as jest.Mock).mockRejectedValue(
      new Error("connection lost"),
    );
    await expect(
      journal.store("icl", [{ date, value: 1 }], source, retrieved),
    ).rejects.toThrow("connection lost");
  });
});
