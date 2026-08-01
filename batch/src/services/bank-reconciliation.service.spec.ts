jest.mock("../shared/database", () => ({
  AppDataSource: { query: jest.fn() },
}));
jest.mock("../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { AppDataSource } from "../shared/database";
import { BankReconciliationBatchService } from "./bank-reconciliation.service";

describe("BankReconciliationBatchService", () => {
  const originalEnv = process.env;
  const query = AppDataSource.query as jest.Mock;
  const fetchMock = jest.fn();

  const candidate = (id: string) => ({
    id,
    company_id: "10000000-0000-0000-0000-000000000001",
    provider: "sandbox",
    external_id: `external-${id}`,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BACKEND_INTERNAL_URL: "http://backend.internal/",
      BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN: "bank-token",
    };
    Object.defineProperty(global, "fetch", {
      writable: true,
      value: fetchMock,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("selects candidates without side effects in dry-run mode", async () => {
    query.mockResolvedValue([candidate("movement-1")]);
    const service = new BankReconciliationBatchService();

    await expect(
      service.process({ limit: 25, minAgeMinutes: 10, dryRun: true }),
    ).resolves.toEqual({
      recordsTotal: 1,
      recordsProcessed: 0,
      recordsFailed: 0,
      recordsSkipped: 1,
      alertsOpened: 0,
      alertsResolved: 0,
      errorLog: [],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("LIMIT $1"), [
      25,
      10,
      null,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a separate internal token for live processing", async () => {
    delete process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN;
    query.mockResolvedValue([candidate("movement-1")]);
    const service = new BankReconciliationBatchService();

    await expect(
      service.process({ limit: 1, minAgeMinutes: 0, dryRun: false }),
    ).rejects.toThrow(
      "BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN not configured",
    );
  });

  it("uses the default backend URL and reports no resolved alert when none exists", async () => {
    delete process.env.BACKEND_INTERNAL_URL;
    delete process.env.BACKEND_PORT;
    query
      .mockResolvedValueOnce([candidate("default-url")])
      .mockResolvedValueOnce([[], 0]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "matched", paymentId: "payment-1" }),
    });

    const result = await new BankReconciliationBatchService().process({
      limit: 1,
      minAgeMinutes: 0,
      dryRun: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/bank-reconciliation/internal/movements/default-url/reconcile",
      expect.any(Object),
    );
    expect(result.alertsResolved).toBe(0);
  });

  it("processes matches, opens unmatched alerts and records request failures", async () => {
    query
      .mockResolvedValueOnce([
        candidate("matched"),
        candidate("unmatched"),
        candidate("failed"),
      ])
      .mockResolvedValueOnce([[{ id: "resolved-alert" }], 1])
      .mockResolvedValueOnce([{ inserted: true }])
      .mockResolvedValueOnce([{ inserted: false }]);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "matched", paymentId: "payment-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "unmatched", reason: "No invoice" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ message: "backend unavailable" }),
      });
    const service = new BankReconciliationBatchService();

    const summary = await service.process({
      companyId: "10000000-0000-0000-0000-000000000001",
      limit: 100,
      minAgeMinutes: 5,
      dryRun: false,
    });

    expect(summary).toEqual({
      recordsTotal: 3,
      recordsProcessed: 1,
      recordsFailed: 1,
      recordsSkipped: 1,
      alertsOpened: 1,
      alertsResolved: 1,
      errorLog: [{ movementId: "failed", error: "backend unavailable" }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.internal/bank-reconciliation/internal/movements/matched/reconcile",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-bank-token": "bank-token",
        },
      },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO bank_reconciliation_alerts"),
      expect.arrayContaining(["No invoice"]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'resolved'"),
      ["matched"],
    );
  });

  it("uses safe fallbacks for an empty successful response", async () => {
    query
      .mockResolvedValueOnce([candidate("unknown")])
      .mockResolvedValueOnce([{ inserted: "t" }]);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await new BankReconciliationBatchService().process({
      limit: 1,
      minAgeMinutes: 0,
      dryRun: false,
    });

    expect(result.recordsSkipped).toBe(1);
    expect(result.alertsOpened).toBe(1);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("ON CONFLICT (movement_id)"),
      expect.arrayContaining(["Movement remains unmatched after retry"]),
    );
  });

  it("falls back to HTTP status when an error response has no JSON body", async () => {
    query
      .mockResolvedValueOnce([candidate("http-error")])
      .mockResolvedValueOnce([{ inserted: false }]);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("invalid json");
      },
    });

    const result = await new BankReconciliationBatchService().process({
      limit: 1,
      minAgeMinutes: 0,
      dryRun: false,
    });
    expect(result.errorLog).toEqual([
      { movementId: "http-error", error: "HTTP 502" },
    ]);
  });
});
