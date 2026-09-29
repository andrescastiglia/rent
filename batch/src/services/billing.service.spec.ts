jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn() },
}));
jest.mock("../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
import { BillingService } from "./billing.service";
import { AppDataSource } from "../shared/database";

describe("Backend billing client", () => {
  const originalEnv = process.env,
    originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const first = "10000000-0000-4000-8000-000000000001";
  const second = "10000000-0000-4000-8000-000000000002";
  const empty = {
    processedLeases: 0,
    invoicesProcessed: 0,
    invoicesFailed: 0,
    invoicesSkipped: 0,
    errors: [],
    totals: [],
    nextCursor: null,
  };
  const respond = (body: object) => ({ ok: true, json: async () => body });
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    process.env = {
      ...originalEnv,
      BACKEND_INTERNAL_URL: "http://backend.test/",
      BATCH_BILLING_INTERNAL_TOKEN: "test-billing",
    };
    global.fetch = fetchMock;
  });
  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });
  afterEach(() => expect(AppDataSource.query).not.toHaveBeenCalled());

  it("walks keyset pages, forwards filters and totals exact cents separately by currency", async () => {
    fetchMock
      .mockResolvedValueOnce(
        respond({
          ...empty,
          processedLeases: 1,
          invoicesProcessed: 1,
          totals: [{ currencyCode: "ARS", amount: "90071992547409.91" }],
          nextCursor: first,
        }),
      )
      .mockResolvedValueOnce(
        respond({
          ...empty,
          processedLeases: 2,
          invoicesProcessed: 2,
          totals: [
            { currencyCode: "ARS", amount: "0.09" },
            { currencyCode: "USD", amount: "1.23" },
          ],
          nextCursor: second,
        }),
      )
      .mockResolvedValueOnce(respond(empty));
    const result = await new BillingService().runBilling(
      "2026-09-30",
      false,
      first,
      second,
    );
    expect(result).toMatchObject({
      processedLeases: 3,
      invoicesProcessed: 3,
      totals: [
        { currencyCode: "ARS", amount: "90071992547410.00" },
        { currencyCode: "USD", amount: "1.23" },
      ],
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      billingDate: "2026-09-30",
      leaseId: first,
      companyId: second,
      afterLeaseId: first,
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { "x-batch-billing-token": "test-billing" },
    });
  });

  it("previews through the same backend selection without local financial writes", async () => {
    fetchMock.mockResolvedValue(
      respond({ ...empty, processedLeases: 2, invoicesSkipped: 2 }),
    );
    expect(
      (await new BillingService().runBilling("2026-09-30", true))
        .invoicesSkipped,
    ).toBe(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).dryRun).toBe(true);
  });

  it("preserves per-lease errors for partial job failure", async () => {
    fetchMock.mockResolvedValue(
      respond({
        ...empty,
        processedLeases: 1,
        invoicesFailed: 1,
        errors: [{ leaseId: first, error: "source changed" }],
      }),
    );
    expect(
      (await new BillingService().runBilling("2026-09-30")).errors,
    ).toEqual([{ leaseId: first, error: "source changed" }]);
  });

  it("rejects malformed dates and missing credentials before network access", async () => {
    await expect(
      new BillingService().runBilling("2026-02-30"),
    ).rejects.toThrow();
    delete process.env.BATCH_BILLING_INTERNAL_TOKEN;
    await expect(new BillingService().runBilling("2026-09-30")).rejects.toThrow(
      "not configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not retry an uncertain HTTP outcome or accept malformed success responses", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection lost"));
    await expect(new BillingService().runBilling("2026-09-30")).rejects.toThrow(
      "connection lost",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(new BillingService().runBilling("2026-09-30")).rejects.toThrow(
      "HTTP 503",
    );
    fetchMock.mockResolvedValueOnce(respond({ ...empty, processedLeases: 3 }));
    await expect(
      new BillingService().runBilling("2026-09-30"),
    ).rejects.toThrow();
  });

  it("rejects a cursor that repeats instead of processing the same page forever", async () => {
    fetchMock.mockResolvedValue(respond({ ...empty, nextCursor: first }));
    await expect(new BillingService().runBilling("2026-09-30")).rejects.toThrow(
      "did not advance",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
