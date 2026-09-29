export {};
async function loadApi(mockMode = false) {
  jest.resetModules();
  const before = {
    NODE_ENV: process.env.NODE_ENV,
    CI: process.env.CI,
    NEXT_PUBLIC_MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE,
  };
  Object.assign(process.env, {
    NODE_ENV: "production",
    CI: "",
    NEXT_PUBLIC_MOCK_MODE: String(mockMode),
  });
  const apiClient = { get: jest.fn() };
  jest.doMock("../api", () => ({ apiClient }));
  jest.doMock("../auth", () => ({ getToken: () => "test-token" }));
  try {
    const { settlementsApi } = await import("./settlements");
    return { settlementsApi, apiClient };
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("Settlement API contract", () => {
  it("uses the same supported month/currency filters for list and summary", async () => {
    const { settlementsApi, apiClient } = await loadApi();
    apiClient.get
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ totals: [] });
    const filters = {
      ownerId: "owner-id",
      currency: "USD",
      period: "2026-09",
      status: "cancelled" as const,
    };
    await settlementsApi.getAll({ ...filters, limit: 5 });
    await settlementsApi.getSummary(filters);
    expect(apiClient.get.mock.calls).toEqual([
      [
        "/settlements?status=cancelled&ownerId=owner-id&currency=USD&periodStart=2026-09&periodEnd=2026-09&limit=5",
        "test-token",
      ],
      [
        "/settlements/summary?status=cancelled&ownerId=owner-id&currency=USD&periodStart=2026-09&periodEnd=2026-09",
        "test-token",
      ],
    ]);
  });
  it("preserves exact totals and rejects the old mixed amount/count contract", async () => {
    const { settlementsApi, apiClient } = await loadApi();
    const summary = {
      totals: [
        {
          currencyCode: "ARS",
          status: "pending",
          netAmount: "9007199254740993.01",
          count: 2,
          lastProcessedAt: null,
        },
        {
          currencyCode: "USD",
          status: "completed",
          netAmount: "0.30",
          count: 1,
          lastProcessedAt: "2026-09-01T12:00:00.000Z",
        },
      ],
    };
    apiClient.get
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ totalPending: 123, totalCompleted: 456 });
    expect(await settlementsApi.getSummary()).toEqual(summary);
    await expect(settlementsApi.getSummary()).rejects.toThrow();
  });
  it("rejects duplicate groups and numeric amounts instead of inferring financial values", async () => {
    const { settlementsApi, apiClient } = await loadApi();
    const total = {
      currencyCode: "ARS",
      status: "pending",
      netAmount: "0.30",
      count: 2,
      lastProcessedAt: null,
    };
    apiClient.get
      .mockResolvedValueOnce({ totals: [total, total] })
      .mockResolvedValueOnce({ totals: [{ ...total, netAmount: 0.3 }] });
    await expect(settlementsApi.getSummary()).rejects.toThrow();
    await expect(settlementsApi.getSummary()).rejects.toThrow();
  });
  it("rejects conflicting exact/range filters before sending a request", async () => {
    const { settlementsApi, apiClient } = await loadApi();
    const filters = { period: "2026-09", periodStart: "2026-08" };
    await expect(settlementsApi.getAll(filters)).rejects.toThrow("period");
    await expect(settlementsApi.getSummary(filters)).rejects.toThrow("period");
    expect(apiClient.get).not.toHaveBeenCalled();
  });
  it("keeps explicit mock mode filters and totals consistent", async () => {
    jest.useFakeTimers();
    try {
      const { settlementsApi, apiClient } = await loadApi(true);
      const pending = settlementsApi.getAll({
        period: "2025-06",
        currency: "ARS",
        limit: 1,
      });
      await jest.advanceTimersByTimeAsync(500);
      expect(await pending).toHaveLength(1);
      const summary = settlementsApi.getSummary({
        period: "2025-06",
        currency: "ARS",
      });
      await jest.advanceTimersByTimeAsync(500);
      expect(await summary).toEqual({
        totals: [
          {
            currencyCode: "ARS",
            status: "pending",
            netAmount: "162000.00",
            count: 1,
            lastProcessedAt: null,
          },
        ],
      });
      expect(apiClient.get).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
