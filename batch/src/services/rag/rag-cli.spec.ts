import { Command } from "commander";

const mockInitializeDatabase = jest.fn();
const mockCloseDatabase = jest.fn();
const mockBackfillRun = jest.fn();
const mockVerify = jest.fn();
const mockBuildHnswIndex = jest.fn();
const mockPurgeStale = jest.fn();
const mockRunOnce = jest.fn();
const mockRunUntilStopped = jest.fn();
const mockRecordJobRun = jest.fn();

jest.mock("../../shared/database", () => ({
  initializeDatabase: (...args: unknown[]) => mockInitializeDatabase(...args),
  closeDatabase: (...args: unknown[]) => mockCloseDatabase(...args),
}));

jest.mock("../../shared/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock("../../shared/metrics", () => ({
  batchMetrics: {
    recordJobRun: (...args: unknown[]) => mockRecordJobRun(...args),
  },
}));

jest.mock("./rag-backfill.service", () => ({
  RagBackfillService: jest.fn().mockImplementation(() => ({
    run: (...args: unknown[]) => mockBackfillRun(...args),
  })),
}));

jest.mock("./rag-verification.service", () => ({
  RagVerificationService: jest.fn().mockImplementation(() => ({
    verify: (...args: unknown[]) => mockVerify(...args),
    buildHnswIndex: (...args: unknown[]) => mockBuildHnswIndex(...args),
    purgeStale: (...args: unknown[]) => mockPurgeStale(...args),
  })),
}));

jest.mock("./rag-outbox-worker.service", () => ({
  RagOutboxWorkerService: jest.fn().mockImplementation(() => ({
    workerId: "test-worker",
    runOnce: (...args: unknown[]) => mockRunOnce(...args),
    runUntilStopped: (...args: unknown[]) => mockRunUntilStopped(...args),
  })),
}));

import { registerRagCommands } from "./rag-cli";

const execute = async (...args: string[]): Promise<void> => {
  const program = new Command();
  program.exitOverride();
  registerRagCommands(program);
  await program.parseAsync(["node", "rag-test", ...args]);
};

const verification = (overrides: Record<string, number> = {}) => ({
  checked: 2,
  missing: 0,
  stale: 0,
  invalidDimensions: 0,
  orphaned: 0,
  selfSearchFailures: 0,
  details: [],
  ...overrides,
});

describe("RAG CLI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    mockInitializeDatabase.mockResolvedValue(undefined);
    mockCloseDatabase.mockResolvedValue(undefined);
    mockBackfillRun.mockResolvedValue({
      processed: 2,
      embedded: 2,
      skipped: 0,
      failed: 0,
      tokens: 5,
      durationMs: 10,
      errors: [],
    });
    mockVerify.mockResolvedValue(verification());
    mockBuildHnswIndex.mockResolvedValue(undefined);
    mockPurgeStale.mockResolvedValue(3);
    mockRunOnce.mockResolvedValue({ claimed: 2, processed: 2, failed: 0 });
    mockRunUntilStopped.mockResolvedValue(undefined);
    mockRecordJobRun.mockResolvedValue(undefined);
  });

  it("runs a dry backfill with parsed options and always closes the database", async () => {
    await execute(
      "rag-backfill",
      "--entity",
      "property",
      "--batch-size",
      "5",
      "--concurrency",
      "3",
      "--checkpoint",
      "checkpoint-id",
      "--dry-run",
      "--force",
    );

    expect(mockBackfillRun).toHaveBeenCalledWith({
      entity: "property",
      companyId: undefined,
      batchSize: 5,
      checkpoint: "checkpoint-id",
      concurrency: 3,
      dryRun: true,
      force: true,
    });
    expect(mockInitializeDatabase).toHaveBeenCalled();
    expect(mockCloseDatabase).toHaveBeenCalled();
  });

  it("marks failed backfills and verification findings with a non-zero exit", async () => {
    mockBackfillRun.mockResolvedValueOnce({
      processed: 1,
      embedded: 0,
      skipped: 0,
      failed: 1,
      tokens: 0,
      durationMs: 1,
      errors: [],
    });
    await execute("rag-backfill", "--dry-run");
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    mockVerify.mockResolvedValueOnce(verification({ missing: 1 }));
    await execute("rag-verify", "--entity", "document", "--sample-size", "4");
    expect(mockVerify).toHaveBeenCalledWith({
      entity: "document",
      companyId: undefined,
      sampleSize: 4,
    });
    expect(process.exitCode).toBe(1);
  });

  it("runs reconciliation and records its combined outcome", async () => {
    mockVerify.mockResolvedValueOnce(verification({ stale: 1 }));

    await execute("rag-reconcile", "--entity", "all", "--sample-size", "8");

    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.objectContaining({
        job: "rag-reconcile",
        status: "failed",
        summary: expect.objectContaining({ recordsFailed: 1 }),
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it("processes one outbox batch and records metrics", async () => {
    mockRunOnce.mockResolvedValueOnce({ claimed: 3, processed: 2, failed: 1 });

    await execute("rag-sync", "--once", "--batch-size", "3");

    expect(mockRecordJobRun).toHaveBeenCalledWith(
      expect.objectContaining({
        job: "rag-sync",
        status: "failed",
        summary: {
          recordsTotal: 3,
          recordsProcessed: 2,
          recordsFailed: 1,
        },
      }),
    );
    expect(process.exitCode).toBe(1);
  });

  it("starts and cleanly stops the continuous outbox worker", async () => {
    await execute("rag-sync", "--poll-interval", "10");

    expect(mockRunUntilStopped).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(process.listenerCount("SIGINT")).toBeGreaterThanOrEqual(0);
  });

  it("builds the HNSW index and purges stale chunks", async () => {
    await execute("rag-build-index");
    expect(mockBuildHnswIndex).toHaveBeenCalled();

    await execute(
      "rag-purge-stale",
      "--older-than",
      "2026-01-01T00:00:00.000Z",
      "--dry-run",
    );
    expect(mockPurgeStale).toHaveBeenCalledWith(
      new Date("2026-01-01T00:00:00.000Z"),
      true,
    );
  });

  it.each([
    [["rag-backfill", "--entity", "invoice", "--dry-run"], "entity must be"],
    [["rag-verify", "--sample-size", "0"], "positive integer"],
    [["rag-purge-stale", "--older-than", "not-a-date"], "valid ISO date"],
  ])("rejects invalid input", async (args, message) => {
    await expect(execute(...args)).rejects.toThrow(message);
    expect(mockCloseDatabase).toHaveBeenCalledTimes(
      args[0] === "rag-purge-stale" ? 0 : 1,
    );
  });
});
