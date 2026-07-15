import { DataSource } from "typeorm";
import { AppDataSource } from "../../shared/database";
import { RagBackfillService } from "./rag-backfill.service";
import { RagDocumentBuilderService } from "./rag-document-builder.service";
import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_VERSION,
  RagCliEntityType,
  RagSourceEntityType,
  RagVerificationResult,
} from "./rag-types";

export class RagVerificationService {
  private readonly dataSource: DataSource;
  private readonly sourceReader: RagBackfillService;
  private readonly builder: RagDocumentBuilderService;

  constructor(
    input: {
      dataSource?: DataSource;
      sourceReader?: RagBackfillService;
      builder?: RagDocumentBuilderService;
    } = {},
  ) {
    this.dataSource = input.dataSource ?? AppDataSource;
    this.builder = input.builder ?? new RagDocumentBuilderService();
    this.sourceReader =
      input.sourceReader ??
      new RagBackfillService({
        dataSource: this.dataSource,
        builder: this.builder,
        dryRun: true,
      });
  }

  async verify(options: {
    entity: RagCliEntityType;
    companyId?: string;
    sampleSize: number;
  }): Promise<RagVerificationResult> {
    const result: RagVerificationResult = {
      checked: 0,
      missing: 0,
      stale: 0,
      invalidDimensions: 0,
      orphaned: 0,
      selfSearchFailures: 0,
      details: [],
    };
    const types: RagSourceEntityType[] =
      options.entity === "all" ? ["property", "document"] : [options.entity];

    for (const type of types) {
      const sources = await this.sourceReader.loadSourceEntities(
        type,
        options.companyId,
        undefined,
        options.sampleSize,
      );
      for (const source of sources) {
        const expected = this.builder.build(source);
        const rows = (await this.dataSource.query(
          `SELECT chunk_key, content_hash, source_updated_at, embedding_model,
                  embedding_version, embedding IS NOT NULL AS has_embedding,
                  CASE WHEN embedding IS NULL THEN NULL ELSE vector_dims(embedding) END AS dimensions
           FROM ai_knowledge_chunks
           WHERE company_id = $1
             AND entity_id = $2
             AND entity_type = $3
             AND embedding_version = $4
             AND deleted_at IS NULL`,
          [
            source.companyId,
            source.id,
            expected[0].entityType,
            RAG_EMBEDDING_VERSION,
          ],
        )) as Array<Record<string, unknown>>;
        const byKey = new Map(rows.map((row) => [String(row.chunk_key), row]));
        result.checked += expected.length;
        for (const chunk of expected) {
          const actual = byKey.get(chunk.chunkKey);
          if (!actual) {
            result.missing += 1;
            result.details.push({
              type: "missing",
              entityType: type,
              entityId: source.id,
              chunkKey: chunk.chunkKey,
            });
            continue;
          }
          if (
            actual.content_hash !== chunk.contentHash ||
            new Date(String(actual.source_updated_at)).getTime() !==
              chunk.sourceUpdatedAt.getTime()
          ) {
            result.stale += 1;
            result.details.push({
              type: "stale",
              entityType: type,
              entityId: source.id,
              chunkKey: chunk.chunkKey,
            });
          }
          if (
            actual.has_embedding !== true ||
            Number(actual.dimensions) !== RAG_EMBEDDING_DIMENSIONS
          ) {
            result.invalidDimensions += 1;
            result.details.push({
              type: "invalid_embedding",
              entityType: type,
              entityId: source.id,
              chunkKey: chunk.chunkKey,
            });
          }
        }
      }
    }

    result.orphaned = await this.countOrphans(types, options.companyId);
    result.selfSearchFailures = await this.countSelfSearchFailures(
      types,
      options.companyId,
      options.sampleSize,
    );
    return result;
  }

  async buildHnswIndex(): Promise<void> {
    const rows = (await this.dataSource.query(
      `SELECT count(*)::integer AS total,
              count(*) FILTER (WHERE embedding IS NULL)::integer AS missing
       FROM ai_knowledge_chunks
       WHERE deleted_at IS NULL`,
    )) as Array<{ total: number; missing: number }>;
    if (Number(rows[0]?.total ?? 0) === 0) {
      throw new Error("Cannot build HNSW before the initial backfill");
    }
    if (Number(rows[0]?.missing ?? 0) > 0) {
      throw new Error(
        "Cannot build HNSW while active chunks have null embeddings",
      );
    }
    await this.dataSource.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_chunks_embedding_hnsw
       ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops)
       WHERE embedding IS NOT NULL AND deleted_at IS NULL`,
    );
    await this.dataSource.query(`ANALYZE ai_knowledge_chunks`);
  }

  async purgeStale(olderThan: Date, dryRun: boolean): Promise<number> {
    const rows = (await this.dataSource.query(
      dryRun
        ? `SELECT count(*)::integer AS count FROM ai_knowledge_chunks
           WHERE deleted_at IS NOT NULL AND deleted_at < $1`
        : `WITH deleted AS (
             DELETE FROM ai_knowledge_chunks
             WHERE deleted_at IS NOT NULL AND deleted_at < $1
             RETURNING 1
           ) SELECT count(*)::integer AS count FROM deleted`,
      [olderThan],
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async countOrphans(
    types: RagSourceEntityType[],
    companyId?: string,
  ): Promise<number> {
    const projections = types.map((type) =>
      type === "property" ? "property_summary" : "document_chunk",
    );
    const rows = (await this.dataSource.query(
      `SELECT count(*)::integer AS count
       FROM ai_knowledge_chunks c
       WHERE c.deleted_at IS NULL
         AND c.entity_type = ANY($1::varchar[])
         AND ($2::uuid IS NULL OR c.company_id = $2)
         AND (
           (c.entity_type = 'property_summary' AND NOT EXISTS (
             SELECT 1 FROM properties p WHERE p.id = c.entity_id AND p.company_id = c.company_id AND p.deleted_at IS NULL
           ))
           OR
           (c.entity_type = 'document_chunk' AND NOT EXISTS (
             SELECT 1 FROM documents d WHERE d.id = c.entity_id AND d.company_id = c.company_id
               AND d.deleted_at IS NULL AND d.status = 'approved'
           ))
         )`,
      [projections, companyId ?? null],
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  private async countSelfSearchFailures(
    types: RagSourceEntityType[],
    companyId: string | undefined,
    sampleSize: number,
  ): Promise<number> {
    const projections = types.map((type) =>
      type === "property" ? "property_summary" : "document_chunk",
    );
    const rows = (await this.dataSource.query(
      `SELECT count(*)::integer AS count
       FROM (
         SELECT 1 - (embedding <=> embedding) AS similarity
         FROM ai_knowledge_chunks
         WHERE deleted_at IS NULL AND embedding IS NOT NULL
           AND entity_type = ANY($1::varchar[])
           AND ($2::uuid IS NULL OR company_id = $2)
         ORDER BY id
         LIMIT $3
       ) sample
       WHERE similarity < 0.999999`,
      [projections, companyId ?? null, sampleSize],
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }
}
