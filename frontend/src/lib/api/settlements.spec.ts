export {};
async function loadApi(mockMode = false, token: string | null = "test-token") {
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
  jest.doMock("../auth", () => ({ getToken: () => token }));
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
  afterEach(() => jest.restoreAllMocks());
  it("preserves historical decimal values and distinguishes missing metadata from zero amounts", async () => {
    const { settlementsApi, apiClient } = await loadApi();
    const historical = {
      id: "historical",
      ownerId: "owner",
      period: "2026-09",
      grossAmount: "1250.75",
      commissionAmount: "87.55",
      netAmount: "1163.20",
      status: "completed",
    };
    const current = {
      ...historical,
      id: "current",
      ownerName: "Ana",
      totalIncome: "0.00",
      currencyCode: "USD",
      scheduledDate: "2026-10-05",
      processedAt: "2026-10-02T15:00:00Z",
      transferReference: "BANK-1",
      notes: "Transferido",
      receiptPdfUrl: "db://receipt",
      receiptName: "receipt.pdf",
      createdAt: "2026-10-01",
      updatedAt: "2026-10-02",
    };
    apiClient.get
      .mockResolvedValueOnce([
        historical,
        current,
        {
          id: "pending",
          ownerId: "owner",
          period: "2026-10",
          status: "pending",
        },
      ])
      .mockResolvedValueOnce(current);
    const rows = await settlementsApi.getAll();
    expect(rows[0]).toMatchObject({
      totalIncome: 1250.75,
      commissionAmount: 87.55,
      netAmount: 1163.2,
      currencyCode: "ARS",
      ownerName: "",
      receiptPdfUrl: null,
    });
    expect(rows[1]).toMatchObject({
      totalIncome: 0,
      currencyCode: "USD",
      transferReference: "BANK-1",
      receiptName: "receipt.pdf",
      processedAt: current.processedAt,
      createdAt: current.createdAt,
    });
    expect(rows[2]).toMatchObject({
      totalIncome: 0,
      commissionAmount: 0,
      netAmount: 0,
    });
    expect(await settlementsApi.getOne("current")).toEqual(rows[1]);
  });

  it("allows a period range without restricting the list to a default month or status", async () => {
    const { settlementsApi, apiClient } = await loadApi(false, null);
    apiClient.get
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ totals: [] });
    await settlementsApi.getAll({
      periodStart: "2026-01",
      periodEnd: "2026-10",
      status: "all",
    });
    await settlementsApi.getSummary();
    expect(apiClient.get.mock.calls).toEqual([
      ["/settlements?periodStart=2026-01&periodEnd=2026-10", undefined],
      ["/settlements/summary", undefined],
    ]);
  });

  it("keeps default mock summaries and status/owner/currency/date filters consistent", async () => {
    jest.useFakeTimers();
    try {
      const { settlementsApi } = await loadApi(true);
      const finish = async <T>(request: Promise<T>) => {
        await jest.runAllTimersAsync();
        return request;
      };
      expect(await finish(settlementsApi.getSummary())).toMatchObject({
        totals: [
          { status: "completed", netAmount: "162000.00" },
          { status: "pending", netAmount: "162000.00" },
        ],
      });
      expect(
        await finish(settlementsApi.getAll({ ownerId: "foreign" })),
      ).toEqual([]);
      expect(await finish(settlementsApi.getAll({ currency: "USD" }))).toEqual(
        [],
      );
      expect(
        await finish(
          settlementsApi.getAll({
            status: "completed",
            periodStart: "2025-05",
            periodEnd: "2025-05",
          }),
        ),
      ).toHaveLength(1);
      expect(
        await finish(
          settlementsApi.getAll({ status: "all", periodStart: "2025-07" }),
        ),
      ).toEqual([]);
      expect(
        await finish(settlementsApi.getAll({ periodEnd: "2025-04" })),
      ).toEqual([]);
      expect((await finish(settlementsApi.getOne("settlement-1"))).id).toBe(
        "settlement-1",
      );
      const rejected = expect(settlementsApi.getOne("foreign")).rejects.toThrow(
        "Settlement not found",
      );
      await jest.runAllTimersAsync();
      await rejected;
    } finally {
      jest.useRealTimers();
    }
  });

  it("downloads the original PDF with safe temporary-resource cleanup even if browser delivery fails", async () => {
    const originalFetch = global.fetch;
    const { settlementsApi } = await loadApi();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => new Blob(["pdf"]) });
    URL.createObjectURL = jest.fn(() => "blob:settlement");
    URL.revokeObjectURL = jest.fn();
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    try {
      await settlementsApi.downloadReceipt("settlement", "original.pdf");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/owners/settlements/settlement/receipt"),
        { method: "GET", headers: { Authorization: "Bearer test-token" } },
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:settlement");
      expect(document.querySelector("a[download]")).toBeNull();
      click.mockImplementationOnce(() => {
        throw new Error("browser blocked");
      });
      await expect(
        settlementsApi.downloadReceipt("settlement"),
      ).rejects.toThrow("browser blocked");
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(document.querySelector("a[download]")).toBeNull();
      jest.mocked(global.fetch).mockResolvedValueOnce({ ok: false } as never);
      await expect(
        settlementsApi.downloadReceipt("settlement"),
      ).rejects.toThrow("download");
    } finally {
      global.fetch = originalFetch;
    }
  });
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
