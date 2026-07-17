import { DataSource } from "typeorm";
import { AppDataSource } from "../../shared/database";
import { RagBackfillService } from "./rag-backfill.service";
import { RagDocumentBuilderService } from "./rag-document-builder.service";
import {
  RAG_EMBEDDING_DIMENSIONS,
  RAG_EMBEDDING_VERSION,
  RAG_PROJECTION_BY_SOURCE,
  RAG_SOURCE_ENTITY_TYPES,
  RagCliEntityType,
  RagRecallResult,
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
      options.entity === "all"
        ? [...RAG_SOURCE_ENTITY_TYPES]
        : [options.entity];

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

  async purgeAudit(
    olderThan: Date,
    dryRun: boolean,
  ): Promise<{
    ragRuns: number;
    shadowComparisons: number;
    mutationConfirmations: number;
    outbox: number;
  }> {
    const countOrDelete = async (
      table: string,
      timestamp: string,
      predicate = "TRUE",
    ) => {
      const rows = (await this.dataSource.query(
        dryRun
          ? `SELECT count(*)::integer AS count FROM ${table} WHERE ${timestamp} < $1 AND ${predicate}`
          : `WITH deleted AS (
               DELETE FROM ${table} WHERE ${timestamp} < $1 AND ${predicate} RETURNING 1
             ) SELECT count(*)::integer AS count FROM deleted`,
        [olderThan],
      )) as Array<{ count: number }>;
      return Number(rows[0]?.count ?? 0);
    };
    return {
      ragRuns: await countOrDelete("ai_rag_runs", "created_at"),
      shadowComparisons: await countOrDelete(
        "ai_rag_shadow_comparisons",
        "created_at",
      ),
      mutationConfirmations: await countOrDelete(
        "ai_tool_mutation_confirmations",
        "created_at",
      ),
      outbox: await countOrDelete(
        "ai_embedding_outbox",
        "COALESCE(processed_at, created_at)",
        "status = 'processed'",
      ),
    };
  }

  async compareHnswRecall(options: {
    companyId?: string;
    sampleSize: number;
    k: number;
    minimumRecall: number;
  }): Promise<RagRecallResult> {
    const samples = (await this.dataSource.query(
      `SELECT id, company_id, embedding::text AS embedding
         FROM ai_knowledge_chunks
        WHERE deleted_at IS NULL AND embedding IS NOT NULL
          AND ($1::uuid IS NULL OR company_id = $1)
        ORDER BY id
        LIMIT $2`,
      [options.companyId ?? null, options.sampleSize],
    )) as Array<{ id: string; company_id: string; embedding: string }>;
    const recalls: number[] = [];
    const failures: RagRecallResult["failures"] = [];

    for (const sample of samples) {
      const approximate = (await this.dataSource.query(
        `SELECT id FROM ai_knowledge_chunks
          WHERE company_id = $1::uuid AND deleted_at IS NULL
            AND embedding IS NOT NULL AND id <> $2::uuid
          ORDER BY embedding <=> $3::vector
          LIMIT $4`,
        [sample.company_id, sample.id, sample.embedding, options.k],
      )) as Array<{ id: string }>;
      const exact = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL enable_indexscan = off`);
        await manager.query(`SET LOCAL enable_bitmapscan = off`);
        return (await manager.query(
          `SELECT id FROM ai_knowledge_chunks
            WHERE company_id = $1::uuid AND deleted_at IS NULL
              AND embedding IS NOT NULL AND id <> $2::uuid
            ORDER BY embedding <=> $3::vector
            LIMIT $4`,
          [sample.company_id, sample.id, sample.embedding, options.k],
        )) as Array<{ id: string }>;
      });
      if (exact.length === 0) continue;
      const approximateIds = new Set(approximate.map(({ id }) => id));
      const missingExactNeighborIds = exact
        .map(({ id }) => id)
        .filter((id) => !approximateIds.has(id));
      const recall =
        (exact.length - missingExactNeighborIds.length) / exact.length;
      recalls.push(recall);
      if (recall < options.minimumRecall) {
        failures.push({
          sourceId: sample.id,
          recall,
          missingExactNeighborIds,
        });
      }
    }

    return {
      evaluated: recalls.length,
      k: options.k,
      averageRecall:
        recalls.length > 0
          ? recalls.reduce((sum, recall) => sum + recall, 0) / recalls.length
          : 1,
      minimumRecall: recalls.length > 0 ? Math.min(...recalls) : 1,
      failures,
    };
  }

  private async countOrphans(
    types: RagSourceEntityType[],
    companyId?: string,
  ): Promise<number> {
    const projections = [
      ...new Set(types.map((type) => RAG_PROJECTION_BY_SOURCE[type])),
    ];
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
           OR (c.entity_type = 'lease_summary' AND NOT EXISTS (
             SELECT 1 FROM leases l WHERE l.id = c.entity_id
               AND l.company_id = c.company_id AND l.deleted_at IS NULL
           ))
           OR (c.entity_type = 'invoice_payment_summary' AND NOT EXISTS (
             SELECT 1 FROM invoices i WHERE i.id = c.entity_id
               AND i.company_id = c.company_id AND i.deleted_at IS NULL
           ))
           OR (c.entity_type = 'owner_portfolio_summary' AND NOT EXISTS (
             SELECT 1 FROM owners o WHERE o.id = c.entity_id
               AND o.company_id = c.company_id AND o.deleted_at IS NULL
           ))
           OR (c.entity_type = 'tenant_account_summary' AND NOT EXISTS (
             SELECT 1 FROM tenant_accounts a WHERE a.id = c.entity_id
               AND a.company_id = c.company_id AND a.deleted_at IS NULL
           ))
           OR (c.entity_type = 'interested_profile_summary' AND NOT EXISTS (
             SELECT 1 FROM interested_profiles ip WHERE ip.id = c.entity_id
               AND ip.company_id = c.company_id AND ip.deleted_at IS NULL
           ))
           OR (c.entity_type = 'activity_chunk' AND NOT (
             (c.metadata->>'activitySourceType' = 'owner_activity' AND EXISTS (
               SELECT 1 FROM owner_activities a WHERE a.id = c.entity_id
                 AND a.company_id = c.company_id AND a.deleted_at IS NULL
             )) OR
             (c.metadata->>'activitySourceType' = 'tenant_activity' AND EXISTS (
               SELECT 1 FROM tenant_activities a WHERE a.id = c.entity_id
                 AND a.company_id = c.company_id AND a.deleted_at IS NULL
             )) OR
             (c.metadata->>'activitySourceType' = 'interested_activity' AND EXISTS (
               SELECT 1 FROM interested_activities a
               JOIN interested_profiles ip ON ip.id = a.interested_profile_id
               WHERE a.id = c.entity_id AND ip.company_id = c.company_id
                 AND ip.deleted_at IS NULL
             ))
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
    const projections = [
      ...new Set(types.map((type) => RAG_PROJECTION_BY_SOURCE[type])),
    ];
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
