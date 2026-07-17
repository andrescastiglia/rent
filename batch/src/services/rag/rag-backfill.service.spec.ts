import { DataSource, EntityManager } from "typeorm";
import { RagBackfillService } from "./rag-backfill.service";
import {
  RAG_EMBEDDING_VERSION,
  RagChunkDraft,
  RagSourceEntity,
  RagSourceEntityType,
} from "./rag-types";

const source = (
  sourceType: RagSourceEntityType = "property",
): RagSourceEntity => ({
  id:
    sourceType === "property"
      ? "20000000-0000-0000-0000-000000000001"
      : "30000000-0000-0000-0000-000000000001",
  companyId: "10000000-0000-0000-0000-000000000001",
  updatedAt: new Date("2026-07-14T12:00:00.000Z"),
  sourceType,
  data: { name: sourceType === "property" ? "Casa" : "Contrato" },
});

const chunk = (): RagChunkDraft => ({
  companyId: source().companyId,
  entityType: "property_summary",
  entityId: source().id,
  chunkKey: "summary",
  chunkIndex: 0,
  content: "Propiedad: Casa",
  metadata: { sourceType: "property" },
  contentHash: "hash-1",
  sourceUpdatedAt: source().updatedAt,
});

const dataSource = (
  query: jest.Mock = jest.fn().mockResolvedValue([]),
  managerQuery: jest.Mock = jest.fn().mockResolvedValue([]),
): DataSource =>
  ({
    query,
    transaction: jest.fn(
      async (action: (manager: EntityManager) => Promise<void>) =>
        action({ query: managerQuery } as unknown as EntityManager),
    ),
  }) as unknown as DataSource;

describe("RagBackfillService", () => {
  it("processes both source types, persists checkpoints and records failures", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RagBackfillService({
      dataSource: dataSource(query),
      embeddings: { model: "test-model" } as never,
    });
    const seen = new Set<string>();
    jest
      .spyOn(service, "loadSourceEntities")
      .mockImplementation(async (type) => {
        if (type !== "property" && type !== "document") return [];
        if (seen.has(type)) return [];
        seen.add(type);
        return [source(type)];
      });
    jest
      .spyOn(service, "syncSourceEntity")
      .mockResolvedValueOnce({ embedded: 1, tokens: 7, skipped: false })
      .mockRejectedValueOnce(new Error("embedding rejected"));

    const result = await service.run({
      entity: "all",
      batchSize: 10,
      concurrency: 2,
      dryRun: false,
      force: false,
      companyId: source().companyId,
    });

    expect(result).toMatchObject({
      processed: 1,
      embedded: 1,
      tokens: 7,
      failed: 1,
      lastCheckpoint: source("document").id,
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        entityType: "document",
        error: "embedding rejected",
      }),
    ]);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO ai_rag_backfill_checkpoints"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("DELETE FROM ai_rag_backfill_checkpoints"),
      ),
    ).toBe(true);
  });

  it("honors a dry-run checkpoint without writing checkpoint state", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new RagBackfillService({
      dataSource: dataSource(query),
      dryRun: true,
    });
    jest.spyOn(service, "loadSourceEntities").mockResolvedValue([]);

    await service.run({
      entity: "property",
      batchSize: 1,
      concurrency: 1,
      dryRun: true,
      force: false,
      checkpoint: source().id,
    });

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    [0, 1, "batchSize"],
    [1, 0, "concurrency"],
    [1.5, 1, "batchSize"],
  ])(
    "rejects invalid execution limits",
    async (batchSize, concurrency, field) => {
      const service = new RagBackfillService({
        dataSource: dataSource(),
        dryRun: true,
      });

      await expect(
        service.run({
          entity: "property",
          batchSize,
          concurrency,
          dryRun: true,
          force: false,
        }),
      ).rejects.toThrow(field);
    },
  );

  it("embeds changed chunks, upserts them and soft-deletes stale chunks", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        chunk_key: "obsolete",
        content_hash: "old",
        embedding_model: "test-model",
        embedding_version: RAG_EMBEDDING_VERSION,
        has_embedding: true,
      },
    ]);
    const managerQuery = jest.fn().mockResolvedValue([]);
    const embed = jest
      .fn()
      .mockResolvedValue({ embeddings: [[0.1, 0.2]], tokens: 3 });
    const service = new RagBackfillService({
      dataSource: dataSource(query, managerQuery),
      builder: { build: jest.fn().mockReturnValue([chunk()]) } as never,
      embeddings: { model: "test-model", embed } as never,
    });

    const result = await service.syncSourceEntity(source(), {
      dryRun: false,
      force: false,
    });

    expect(result).toEqual({ embedded: 1, tokens: 3, skipped: false });
    expect(embed).toHaveBeenCalledWith(["Propiedad: Casa"]);
    expect(managerQuery).toHaveBeenCalledTimes(2);
    expect(managerQuery.mock.calls[0][0]).toContain(
      "INSERT INTO ai_knowledge_chunks",
    );
    expect(managerQuery.mock.calls[0][1]).toContain("[0.1,0.2]");
    expect(managerQuery.mock.calls[1][0]).toContain("SET deleted_at = NOW()");
  });

  it("skips an unchanged dry-run chunk and detects forced changes", async () => {
    const current = {
      chunk_key: "summary",
      content_hash: "hash-1",
      embedding_model: "test-model",
      embedding_version: RAG_EMBEDDING_VERSION,
      has_embedding: true,
    };
    const service = new RagBackfillService({
      dataSource: dataSource(jest.fn().mockResolvedValue([current])),
      builder: { build: jest.fn().mockReturnValue([chunk()]) } as never,
      dryRun: true,
    });
    process.env.AI_EMBEDDING_MODEL = "test-model";

    await expect(
      service.syncSourceEntity(source(), { dryRun: true, force: false }),
    ).resolves.toEqual({ embedded: 0, tokens: 0, skipped: true });
    await expect(
      service.syncSourceEntity(source(), { dryRun: true, force: true }),
    ).resolves.toEqual({ embedded: 1, tokens: 0, skipped: false });

    delete process.env.AI_EMBEDDING_MODEL;
  });

  it("requires an embedding client for a real synchronization", async () => {
    const service = new RagBackfillService({
      dataSource: dataSource(),
      builder: { build: jest.fn().mockReturnValue([chunk()]) } as never,
      dryRun: true,
    });

    await expect(
      service.syncSourceEntity(source(), { dryRun: false, force: false }),
    ).rejects.toThrow("Embedding client is not configured");
  });

  it("loads and maps property and document rows for batch and entity lookups", async () => {
    const propertyRow = {
      id: source().id,
      company_id: source().companyId,
      updated_at: source().updatedAt.toISOString(),
      name: "Casa",
      property_type: "house",
      operations: ["rent"],
      features: [],
    };
    const documentRow = {
      id: source("document").id,
      company_id: source().companyId,
      updated_at: source().updatedAt.toISOString(),
      name: "Contrato",
      document_type: "lease_contract",
      entity_type: "lease",
      entity_id: "40000000-0000-0000-0000-000000000001",
      lease_contract_text: "Cláusulas",
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([propertyRow])
      .mockResolvedValueOnce([documentRow])
      .mockResolvedValueOnce([propertyRow])
      .mockResolvedValueOnce([documentRow]);
    const service = new RagBackfillService({
      dataSource: dataSource(query),
      dryRun: true,
    });

    const properties = await service.loadSourceEntities(
      "property",
      undefined,
      undefined,
      5,
    );
    const documents = await service.loadSourceEntities(
      "document",
      source().companyId,
      source().id,
      5,
    );
    const property = await service.loadSourceEntity(
      "property",
      source().companyId,
      source().id,
    );
    const document = await service.loadSourceEntity(
      "document",
      source().companyId,
      source("document").id,
    );

    expect(properties[0]).toMatchObject({
      sourceType: "property",
      data: { propertyType: "house" },
    });
    expect(documents[0]).toMatchObject({
      sourceType: "document",
      data: { leaseContractText: "Cláusulas" },
    });
    expect(property?.id).toBe(source().id);
    expect(document?.id).toBe(source("document").id);
    expect(query.mock.calls[0][1]).toEqual([null, null, 5]);
    expect(query.mock.calls[1][1]).toEqual([
      source().companyId,
      source().id,
      5,
    ]);
  });
});
