import { DataSource } from "typeorm";
import { RagVerificationService } from "./rag-verification.service";
import {
  RAG_EMBEDDING_DIMENSIONS,
  RagChunkDraft,
  RagSourceEntity,
} from "./rag-types";

const source = (sourceType: "property" | "document"): RagSourceEntity => ({
  id: `${sourceType}-id`,
  companyId: "company-id",
  sourceType,
  updatedAt: new Date("2026-07-14T12:00:00.000Z"),
  data: { name: sourceType },
});

const draft = (input: RagSourceEntity, key: string): RagChunkDraft => ({
  companyId: input.companyId,
  entityType:
    input.sourceType === "property" ? "property_summary" : "document_chunk",
  entityId: input.id,
  chunkKey: key,
  chunkIndex: 0,
  content: key,
  metadata: {},
  contentHash: `hash-${key}`,
  sourceUpdatedAt: input.updatedAt,
});

describe("RagVerificationService", () => {
  it("reports missing, stale, invalid, orphaned and self-search failures", async () => {
    const property = source("property");
    const document = source("document");
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          chunk_key: "good",
          content_hash: "hash-good",
          source_updated_at: property.updatedAt,
          has_embedding: true,
          dimensions: RAG_EMBEDDING_DIMENSIONS,
        },
        {
          chunk_key: "stale",
          content_hash: "old-hash",
          source_updated_at: new Date(0),
          has_embedding: false,
          dimensions: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 1 }]);
    const sourceReader = {
      loadSourceEntities: jest
        .fn()
        .mockResolvedValueOnce([property])
        .mockResolvedValueOnce([document]),
    };
    const builder = {
      build: jest.fn((input: RagSourceEntity) =>
        input.sourceType === "property"
          ? [draft(input, "good"), draft(input, "stale")]
          : [draft(input, "missing")],
      ),
    };
    const service = new RagVerificationService({
      dataSource: { query } as unknown as DataSource,
      sourceReader: sourceReader as never,
      builder: builder as never,
    });

    const result = await service.verify({
      entity: "all",
      companyId: "company-id",
      sampleSize: 20,
    });

    expect(result).toMatchObject({
      checked: 3,
      missing: 1,
      stale: 1,
      invalidDimensions: 1,
      orphaned: 2,
      selfSearchFailures: 1,
    });
    expect(result.details.map((detail) => detail.type)).toEqual([
      "stale",
      "invalid_embedding",
      "missing",
    ]);
    expect(sourceReader.loadSourceEntities).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[2][1]).toEqual([
      ["property_summary", "document_chunk"],
      "company-id",
    ]);
  });

  it.each([
    [[], "initial backfill"],
    [[{ total: 2, missing: 1 }], "null embeddings"],
  ])(
    "rejects an HNSW build when chunks are not ready",
    async (rows, message) => {
      const query = jest.fn().mockResolvedValue(rows);
      const service = new RagVerificationService({
        dataSource: { query } as unknown as DataSource,
        sourceReader: {} as never,
        builder: {} as never,
      });

      await expect(service.buildHnswIndex()).rejects.toThrow(message);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it("builds and analyzes the HNSW index when every chunk is embedded", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 2, missing: 0 }])
      .mockResolvedValue([]);
    const service = new RagVerificationService({
      dataSource: { query } as unknown as DataSource,
      sourceReader: {} as never,
      builder: {} as never,
    });

    await service.buildHnswIndex();

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain("CREATE INDEX CONCURRENTLY");
    expect(query.mock.calls[2][0]).toContain("ANALYZE ai_knowledge_chunks");
  });

  it.each([true, false])(
    "purges stale chunks with dryRun=%s",
    async (dryRun) => {
      const query = jest.fn().mockResolvedValue([{ count: "4" }]);
      const service = new RagVerificationService({
        dataSource: { query } as unknown as DataSource,
        sourceReader: {} as never,
        builder: {} as never,
      });
      const olderThan = new Date("2026-01-01T00:00:00.000Z");

      await expect(service.purgeStale(olderThan, dryRun)).resolves.toBe(4);
      expect(query.mock.calls[0][0]).toContain(
        dryRun ? "SELECT count" : "DELETE FROM ai_knowledge_chunks",
      );
      expect(query.mock.calls[0][1]).toEqual([olderThan]);
    },
  );
});
