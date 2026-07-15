import { RagOutboxWorkerService } from "./rag-outbox-worker.service";

const event = (input: Partial<Record<string, unknown>> = {}) => ({
  id: "00000000-0000-0000-0000-000000000001",
  company_id: "10000000-0000-0000-0000-000000000001",
  entity_type: "property",
  entity_id: "20000000-0000-0000-0000-000000000001",
  operation: "upsert",
  source_updated_at: new Date("2026-07-14T12:00:00Z"),
  attempts: 1,
  created_at: new Date("2026-07-14T12:00:00Z"),
  ...input,
});

describe("RagOutboxWorkerService", () => {
  it("claims with SKIP LOCKED and compacts events for the same entity", async () => {
    const claimed = [
      event(),
      event({
        id: "00000000-0000-0000-0000-000000000002",
        source_updated_at: new Date("2026-07-14T12:01:00Z"),
        created_at: new Date("2026-07-14T12:01:00Z"),
      }),
    ];
    const manager = {
      query: jest.fn().mockResolvedValue([claimed, claimed.length]),
    };
    const dataSource = {
      transaction: jest.fn(async (action) => action(manager)),
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("locked_at <")) return [];
        if (sql.includes("GROUP BY entity_type")) return [];
        return [];
      }),
    };
    const source = {
      id: claimed[0].entity_id,
      companyId: claimed[0].company_id,
      sourceType: "property",
      updatedAt: new Date(),
      data: {},
    };
    const sourceReader = {
      loadSourceEntity: jest.fn().mockResolvedValue(source),
      syncSourceEntity: jest
        .fn()
        .mockResolvedValue({ embedded: 1, tokens: 10, skipped: false }),
    };
    const worker = new RagOutboxWorkerService({
      dataSource: dataSource as any,
      sourceReader: sourceReader as any,
      workerId: "test-worker",
    });

    const result = await worker.runOnce();

    expect(manager.query.mock.calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(sourceReader.syncSourceEntity).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        claimed: 2,
        entities: 1,
        processed: 2,
        compacted: 1,
        embedded: 1,
        tokens: 10,
      }),
    );
    const processedCall = dataSource.query.mock.calls.find(([sql]) =>
      String(sql).includes("processed_at = NOW()"),
    );
    expect(processedCall).toBeDefined();
    expect(processedCall![1]![0]).toHaveLength(2);
  });

  it("retries a failed entity without stopping the batch", async () => {
    const manager = { query: jest.fn().mockResolvedValue([event()]) };
    const dataSource = {
      transaction: jest.fn(async (action) => action(manager)),
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("locked_at <")) return [];
        if (sql.includes("RETURNING status")) return [{ status: "pending" }];
        if (sql.includes("GROUP BY entity_type")) return [];
        return [];
      }),
    };
    const sourceReader = {
      loadSourceEntity: jest.fn().mockResolvedValue({
        id: event().entity_id,
        companyId: event().company_id,
        sourceType: "property",
        updatedAt: new Date(),
        data: {},
      }),
      syncSourceEntity: jest.fn().mockRejectedValue(new Error("rate limited")),
    };
    const worker = new RagOutboxWorkerService({
      dataSource: dataSource as any,
      sourceReader: sourceReader as any,
      workerId: "test-worker",
      maxAttempts: 3,
    });

    const result = await worker.runOnce();

    expect(result.retried).toBe(1);
    expect(result.failed).toBe(0);
    expect(
      dataSource.query.mock.calls.some(([sql]) =>
        String(sql).includes("power(2, attempts - 1)"),
      ),
    ).toBe(true);
  });

  it("soft deletes projections when the current source no longer exists", async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([event({ entity_type: "document" })]),
    };
    const dataSource = {
      transaction: jest.fn(async (action) => action(manager)),
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("locked_at <")) return [];
        if (sql.includes("GROUP BY entity_type")) return [];
        return [];
      }),
    };
    const sourceReader = {
      loadSourceEntity: jest.fn().mockResolvedValue(undefined),
      syncSourceEntity: jest.fn(),
    };
    const worker = new RagOutboxWorkerService({
      dataSource: dataSource as any,
      sourceReader: sourceReader as any,
      workerId: "test-worker",
    });

    await worker.runOnce();

    const deleteCall = dataSource.query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE ai_knowledge_chunks"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall![1]).toEqual([
      event().company_id,
      "document_chunk",
      event().entity_id,
    ]);
  });
});
