import { DataSource, EntityManager } from "typeorm";
import { AppDataSource } from "../../shared/database";
import { logger } from "../../shared/logger";
import { EmbeddingClientService } from "./embedding-client.service";
import { RagDocumentBuilderService } from "./rag-document-builder.service";
import {
  RAG_EMBEDDING_VERSION,
  RagBackfillOptions,
  RagBackfillResult,
  RagChunkDraft,
  RagEntitySyncResult,
  RagSourceEntity,
  RagSourceEntityType,
} from "./rag-types";

type ExistingChunk = {
  chunk_key: string;
  content_hash: string;
  embedding_model: string;
  embedding_version: number;
  has_embedding: boolean;
};

export class RagBackfillService {
  private readonly dataSource: DataSource;
  private readonly builder: RagDocumentBuilderService;
  private readonly embeddings?: EmbeddingClientService;

  constructor(
    input: {
      dataSource?: DataSource;
      builder?: RagDocumentBuilderService;
      embeddings?: EmbeddingClientService;
      dryRun?: boolean;
    } = {},
  ) {
    this.dataSource = input.dataSource ?? AppDataSource;
    this.builder = input.builder ?? new RagDocumentBuilderService();
    this.embeddings =
      input.embeddings ??
      (input.dryRun ? undefined : new EmbeddingClientService());
  }

  async run(options: RagBackfillOptions): Promise<RagBackfillResult> {
    const startedAt = Date.now();
    this.validateOptions(options);
    const result: RagBackfillResult = {
      processed: 0,
      embedded: 0,
      skipped: 0,
      failed: 0,
      tokens: 0,
      durationMs: 0,
      errors: [],
    };
    const sourceTypes: RagSourceEntityType[] =
      options.entity === "all" ? ["property", "document"] : [options.entity];

    for (const sourceType of sourceTypes) {
      await this.backfillSourceType(sourceType, options, result);
    }
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  private async backfillSourceType(
    sourceType: RagSourceEntityType,
    options: RagBackfillOptions,
    result: RagBackfillResult,
  ): Promise<void> {
    const checkpointKey = this.checkpointKey(sourceType, options.companyId);
    let checkpoint =
      options.checkpoint ?? (await this.loadCheckpoint(checkpointKey));
    while (true) {
      const sources = await this.loadSourceEntities(
        sourceType,
        options.companyId,
        checkpoint,
        options.batchSize,
      );
      if (sources.length === 0) {
        break;
      }

      await this.processConcurrently(
        sources,
        options.concurrency,
        async (source) => {
          try {
            const entityResult = await this.syncSourceEntity(source, options);
            result.processed += 1;
            result.embedded += entityResult.embedded;
            result.tokens += entityResult.tokens;
            if (entityResult.skipped) result.skipped += 1;
          } catch (error) {
            result.failed += 1;
            const message =
              error instanceof Error ? error.message : String(error);
            result.errors.push({
              entityType: sourceType,
              entityId: source.id,
              error: message,
            });
            logger.error("RAG entity backfill failed", {
              sourceType,
              entityId: source.id,
              error: message,
            });
          }
        },
      );

      checkpoint = sources[sources.length - 1]?.id;
      result.lastCheckpoint = checkpoint;
      if (!options.dryRun && checkpoint) {
        await this.saveCheckpoint(
          checkpointKey,
          sourceType,
          options.companyId,
          checkpoint,
        );
      }
      logger.info("RAG backfill batch completed", {
        sourceType,
        batchSize: sources.length,
        checkpoint,
        processed: result.processed,
        embedded: result.embedded,
        skipped: result.skipped,
        failed: result.failed,
      });
    }

    if (!options.dryRun) {
      await this.clearCheckpoint(checkpointKey);
    }
  }

  async syncSourceEntity(
    source: RagSourceEntity,
    options: Pick<RagBackfillOptions, "dryRun" | "force">,
  ): Promise<RagEntitySyncResult> {
    const chunks = this.builder.build(source);
    const projectionTypes = [
      ...new Set(chunks.map((chunk) => chunk.entityType)),
    ];
    const existing = (await this.dataSource.query(
      `SELECT chunk_key, content_hash, embedding_model, embedding_version,
              embedding IS NOT NULL AS has_embedding
       FROM ai_knowledge_chunks
       WHERE company_id = $1
         AND entity_id = $2
         AND entity_type = ANY($3::varchar[])
         AND embedding_version = $4`,
      [source.companyId, source.id, projectionTypes, RAG_EMBEDDING_VERSION],
    )) as ExistingChunk[];
    const byKey = new Map(existing.map((chunk) => [chunk.chunk_key, chunk]));
    const model =
      this.embeddings?.model ??
      process.env.AI_EMBEDDING_MODEL ??
      "text-embedding-3-small";
    const changed = chunks.filter((chunk) => {
      const current = byKey.get(chunk.chunkKey);
      return (
        options.force ||
        !current ||
        current.content_hash !== chunk.contentHash ||
        current.embedding_model !== model ||
        current.embedding_version !== RAG_EMBEDDING_VERSION ||
        !current.has_embedding
      );
    });
    const staleExists = existing.some(
      (current) =>
        !chunks.some((chunk) => chunk.chunkKey === current.chunk_key),
    );

    if (options.dryRun) {
      return {
        embedded: changed.length,
        tokens: 0,
        skipped: changed.length === 0 && !staleExists,
      };
    }
    if (!this.embeddings) throw new Error("Embedding client is not configured");

    const embeddingResult = await this.embeddings.embed(
      changed.map((chunk) => chunk.content),
    );
    await this.dataSource.transaction(async (manager) => {
      for (let index = 0; index < changed.length; index++) {
        await this.upsertChunk(
          manager,
          changed[index],
          embeddingResult.embeddings[index],
          model,
        );
      }
      await manager.query(
        `UPDATE ai_knowledge_chunks
         SET deleted_at = NOW(), updated_at = NOW()
         WHERE company_id = $1
           AND entity_id = $2
           AND entity_type = ANY($3::varchar[])
           AND embedding_version = $4
           AND NOT (chunk_key = ANY($5::varchar[]))
           AND deleted_at IS NULL`,
        [
          source.companyId,
          source.id,
          projectionTypes,
          RAG_EMBEDDING_VERSION,
          chunks.map((chunk) => chunk.chunkKey),
        ],
      );
    });
    return {
      embedded: changed.length,
      tokens: embeddingResult.tokens,
      skipped: changed.length === 0 && !staleExists,
    };
  }

  private async upsertChunk(
    manager: EntityManager,
    chunk: RagChunkDraft,
    embedding: number[],
    model: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO ai_knowledge_chunks (
         company_id, entity_type, entity_id, chunk_key, chunk_index, content,
         metadata, embedding, embedding_model, embedding_version, content_hash,
         source_updated_at, embedded_at, deleted_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::vector, $9, $10, $11, $12, NOW(), NULL)
       ON CONFLICT (company_id, entity_type, entity_id, chunk_key, embedding_version)
       DO UPDATE SET
         chunk_index = EXCLUDED.chunk_index,
         content = EXCLUDED.content,
         metadata = EXCLUDED.metadata,
         embedding = EXCLUDED.embedding,
         embedding_model = EXCLUDED.embedding_model,
         content_hash = EXCLUDED.content_hash,
         source_updated_at = EXCLUDED.source_updated_at,
         embedded_at = NOW(),
         deleted_at = NULL,
         updated_at = NOW()`,
      [
        chunk.companyId,
        chunk.entityType,
        chunk.entityId,
        chunk.chunkKey,
        chunk.chunkIndex,
        chunk.content,
        JSON.stringify(chunk.metadata),
        `[${embedding.join(",")}]`,
        model,
        RAG_EMBEDDING_VERSION,
        chunk.contentHash,
        chunk.sourceUpdatedAt,
      ],
    );
  }

  async loadSourceEntities(
    sourceType: RagSourceEntityType,
    companyId: string | undefined,
    checkpoint: string | undefined,
    limit: number,
  ): Promise<RagSourceEntity[]> {
    return sourceType === "property"
      ? this.loadProperties(companyId, checkpoint, limit)
      : this.loadDocuments(companyId, checkpoint, limit);
  }

  async loadSourceEntity(
    sourceType: RagSourceEntityType,
    companyId: string,
    entityId: string,
  ): Promise<RagSourceEntity | undefined> {
    const rows =
      sourceType === "property"
        ? await this.loadPropertyById(companyId, entityId)
        : await this.loadDocumentById(companyId, entityId);
    return rows[0];
  }

  private async loadPropertyById(
    companyId: string,
    entityId: string,
  ): Promise<RagSourceEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT p.*,
              COALESCE(
                jsonb_agg(jsonb_build_object(
                  'category', pf.category,
                  'name', pf.name,
                  'value', pf.value,
                  'isHighlighted', pf.is_highlighted,
                  'displayOrder', pf.display_order
                ) ORDER BY pf.display_order, pf.category, pf.name)
                FILTER (WHERE pf.id IS NOT NULL), '[]'::jsonb
              ) AS features
       FROM properties p
       LEFT JOIN property_features pf ON pf.property_id = p.id
       WHERE p.id = $1 AND p.company_id = $2 AND p.deleted_at IS NULL
       GROUP BY p.id`,
      [entityId, companyId],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapProperty(row));
  }

  private async loadDocumentById(
    companyId: string,
    entityId: string,
  ): Promise<RagSourceEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT d.*,
              CASE WHEN d.entity_type = 'lease'
                   THEN COALESCE(l.confirmed_contract_text, l.draft_contract_text)
                   ELSE NULL
              END AS lease_contract_text
       FROM documents d
       LEFT JOIN leases l ON d.entity_type = 'lease' AND l.id = d.entity_id
       WHERE d.id = $1
         AND d.company_id = $2
         AND d.deleted_at IS NULL
         AND d.status = 'approved'`,
      [entityId, companyId],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapDocument(row));
  }

  private async loadProperties(
    companyId: string | undefined,
    checkpoint: string | undefined,
    limit: number,
  ): Promise<RagSourceEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT p.*,
              COALESCE(
                jsonb_agg(jsonb_build_object(
                  'category', pf.category,
                  'name', pf.name,
                  'value', pf.value,
                  'isHighlighted', pf.is_highlighted,
                  'displayOrder', pf.display_order
                ) ORDER BY pf.display_order, pf.category, pf.name)
                FILTER (WHERE pf.id IS NOT NULL), '[]'::jsonb
              ) AS features
       FROM properties p
       LEFT JOIN property_features pf ON pf.property_id = p.id
       WHERE p.deleted_at IS NULL
         AND ($1::uuid IS NULL OR p.company_id = $1)
         AND ($2::uuid IS NULL OR p.id > $2)
       GROUP BY p.id
       ORDER BY p.id
       LIMIT $3`,
      [companyId ?? null, checkpoint ?? null, limit],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapProperty(row));
  }

  private async loadDocuments(
    companyId: string | undefined,
    checkpoint: string | undefined,
    limit: number,
  ): Promise<RagSourceEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT d.*,
              CASE WHEN d.entity_type = 'lease'
                   THEN COALESCE(l.confirmed_contract_text, l.draft_contract_text)
                   ELSE NULL
              END AS lease_contract_text
       FROM documents d
       LEFT JOIN leases l ON d.entity_type = 'lease' AND l.id = d.entity_id
       WHERE d.deleted_at IS NULL
         AND d.status = 'approved'
         AND ($1::uuid IS NULL OR d.company_id = $1)
         AND ($2::uuid IS NULL OR d.id > $2)
       ORDER BY d.id
       LIMIT $3`,
      [companyId ?? null, checkpoint ?? null, limit],
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapDocument(row));
  }

  private mapProperty(row: Record<string, unknown>): RagSourceEntity {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      updatedAt: new Date(String(row.updated_at)),
      sourceType: "property",
      data: {
        name: row.name,
        propertyType: row.property_type,
        status: row.status,
        operations: row.operations,
        operationState: row.operation_state,
        addressStreet: row.address_street,
        addressNumber: row.address_number,
        addressFloor: row.address_floor,
        addressApartment: row.address_apartment,
        addressCity: row.address_city,
        addressState: row.address_state,
        addressCountry: row.address_country,
        totalArea: row.total_area,
        builtArea: row.built_area,
        yearBuilt: row.year_built,
        totalUnits: row.total_units,
        description: row.description,
        allowsPets: row.allows_pets,
        acceptedGuaranteeTypes: row.accepted_guarantee_types,
        maxOccupants: row.max_occupants,
        amenities: row.amenities,
        notes: row.notes,
        features: row.features,
      },
    };
  }

  private mapDocument(row: Record<string, unknown>): RagSourceEntity {
    return {
      id: String(row.id),
      companyId: String(row.company_id),
      updatedAt: new Date(String(row.updated_at)),
      sourceType: "document",
      data: {
        documentType: row.document_type,
        status: row.status,
        name: row.name,
        description: row.description,
        relatedEntityType: row.entity_type,
        relatedEntityId: row.entity_id,
        tags: row.tags,
        metadata: row.metadata,
        leaseContractText: row.lease_contract_text,
      },
    };
  }

  private async loadCheckpoint(key: string): Promise<string | undefined> {
    const rows = (await this.dataSource.query(
      `SELECT last_entity_id FROM ai_rag_backfill_checkpoints WHERE checkpoint_key = $1`,
      [key],
    )) as Array<{ last_entity_id: string }>;
    return rows[0]?.last_entity_id;
  }

  private async saveCheckpoint(
    key: string,
    sourceType: RagSourceEntityType,
    companyId: string | undefined,
    entityId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO ai_rag_backfill_checkpoints (
         checkpoint_key, entity_type, company_id, embedding_version, last_entity_id
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (checkpoint_key) DO UPDATE SET
         last_entity_id = EXCLUDED.last_entity_id,
         updated_at = NOW()`,
      [key, sourceType, companyId ?? null, RAG_EMBEDDING_VERSION, entityId],
    );
  }

  private async clearCheckpoint(key: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM ai_rag_backfill_checkpoints WHERE checkpoint_key = $1`,
      [key],
    );
  }

  private checkpointKey(
    sourceType: RagSourceEntityType,
    companyId?: string,
  ): string {
    return `${sourceType}:${companyId ?? "all"}:v${RAG_EMBEDDING_VERSION}`;
  }

  private validateOptions(options: RagBackfillOptions): void {
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
      throw new Error("batchSize must be a positive integer");
    }
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error("concurrency must be a positive integer");
    }
  }

  private async processConcurrently<T>(
    values: T[],
    concurrency: number,
    action: (value: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, values.length) },
      async () => {
        while (cursor < values.length) {
          const current = values[cursor++];
          await action(current);
        }
      },
    );
    await Promise.all(workers);
  }
}
