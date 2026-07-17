import { DataSource, EntityManager } from "typeorm";
import { AppDataSource } from "../../shared/database";
import { logger } from "../../shared/logger";
import { EmbeddingClientService } from "./embedding-client.service";
import { RagDocumentBuilderService } from "./rag-document-builder.service";
import {
  RAG_EMBEDDING_VERSION,
  RAG_SOURCE_ENTITY_TYPES,
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
      options.entity === "all"
        ? [...RAG_SOURCE_ENTITY_TYPES]
        : [options.entity];

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
    switch (sourceType) {
      case "property":
        return this.loadProperties(companyId, checkpoint, limit);
      case "document":
        return this.loadDocuments(companyId, checkpoint, limit);
      default:
        return this.loadAdditionalSources(
          sourceType,
          companyId,
          checkpoint,
          limit,
        );
    }
  }

  async loadSourceEntity(
    sourceType: RagSourceEntityType,
    companyId: string,
    entityId: string,
  ): Promise<RagSourceEntity | undefined> {
    const rows =
      sourceType === "property"
        ? await this.loadPropertyById(companyId, entityId)
        : sourceType === "document"
          ? await this.loadDocumentById(companyId, entityId)
          : await this.loadAdditionalSources(
              sourceType,
              companyId,
              undefined,
              1,
              entityId,
            );
    return rows[0];
  }

  private async loadAdditionalSources(
    sourceType: Exclude<RagSourceEntityType, "property" | "document">,
    companyId: string | undefined,
    checkpoint: string | undefined,
    limit: number,
    entityId?: string,
  ): Promise<RagSourceEntity[]> {
    const values = [
      companyId ?? null,
      checkpoint ?? null,
      limit,
      entityId ?? null,
    ];
    let sql: string;
    switch (sourceType) {
      case "lease":
        sql = `SELECT l.*, p.name AS property_name, p.address_city AS property_city,
                      concat_ws(' ', tu.first_name, tu.last_name) AS tenant_name,
                      concat_ws(' ', ou.first_name, ou.last_name) AS owner_name,
                      GREATEST(
                        l.updated_at, p.updated_at, o.updated_at, ou.updated_at,
                        COALESCE(t.updated_at, l.updated_at),
                        COALESCE(tu.updated_at, l.updated_at)
                      ) AS source_updated_at
                 FROM leases l
                 JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
                 JOIN owners o ON o.id = l.owner_id AND o.deleted_at IS NULL
                 JOIN users ou ON ou.id = o.user_id AND ou.deleted_at IS NULL
            LEFT JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
            LEFT JOIN users tu ON tu.id = t.user_id AND tu.deleted_at IS NULL
                WHERE l.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR l.company_id = $1)
                  AND ($2::uuid IS NULL OR l.id > $2)
                  AND ($4::uuid IS NULL OR l.id = $4)
                ORDER BY l.id LIMIT $3`;
        break;
      case "invoice":
        sql = `SELECT i.*, l.tenant_id, l.lease_number, p.name AS property_name,
                      GREATEST(
                        i.updated_at, l.updated_at, p.updated_at,
                        COALESCE(max(pay.updated_at), i.updated_at)
                      ) AS source_updated_at,
                      COALESCE(jsonb_agg(jsonb_build_object(
                        'id', pay.id, 'paymentNumber', pay.payment_number,
                        'method', pay.payment_method
                      ) ORDER BY pay.payment_date, pay.id)
                      FILTER (WHERE pay.id IS NOT NULL), '[]'::jsonb) AS payments
                 FROM invoices i
                 JOIN leases l ON l.id = i.lease_id AND l.deleted_at IS NULL
                 JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
            LEFT JOIN payments pay ON pay.invoice_id = i.id AND pay.deleted_at IS NULL
                WHERE i.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR i.company_id = $1)
                  AND ($2::uuid IS NULL OR i.id > $2)
                  AND ($4::uuid IS NULL OR i.id = $4)
                GROUP BY i.id, l.id, p.id
                ORDER BY i.id LIMIT $3`;
        break;
      case "owner":
        sql = `SELECT o.*, concat_ws(' ', u.first_name, u.last_name) AS owner_name,
                      GREATEST(
                        o.updated_at, u.updated_at,
                        COALESCE(max(p.updated_at), o.updated_at)
                      ) AS source_updated_at,
                      COALESCE(jsonb_agg(jsonb_build_object(
                        'id', p.id, 'name', p.name, 'propertyType', p.property_type,
                        'city', p.address_city
                      ) ORDER BY p.name, p.id)
                      FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS properties
                 FROM owners o
                 JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
            LEFT JOIN properties p ON p.owner_id = o.id AND p.deleted_at IS NULL
                WHERE o.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR o.company_id = $1)
                  AND ($2::uuid IS NULL OR o.id > $2)
                  AND ($4::uuid IS NULL OR o.id = $4)
                GROUP BY o.id, u.id
                ORDER BY o.id LIMIT $3`;
        break;
      case "tenant_account":
        sql = `SELECT a.*, t.user_id AS tenant_user_id,
                      concat_ws(' ', u.first_name, u.last_name) AS tenant_name,
                      l.lease_number, l.property_id, p.name AS property_name,
                      GREATEST(a.updated_at, t.updated_at, u.updated_at, l.updated_at, p.updated_at)
                        AS source_updated_at
                 FROM tenant_accounts a
                 JOIN tenants t ON t.id = a.tenant_id AND t.deleted_at IS NULL
                 JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
                 JOIN leases l ON l.id = a.lease_id AND l.deleted_at IS NULL
                 JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
                WHERE a.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR a.company_id = $1)
                  AND ($2::uuid IS NULL OR a.id > $2)
                  AND ($4::uuid IS NULL OR a.id = $4)
                ORDER BY a.id LIMIT $3`;
        break;
      case "interested":
        sql = `SELECT ip.*
                 FROM interested_profiles ip
                WHERE ip.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR ip.company_id = $1)
                  AND ($2::uuid IS NULL OR ip.id > $2)
                  AND ($4::uuid IS NULL OR ip.id = $4)
                ORDER BY ip.id LIMIT $3`;
        break;
      case "owner_activity":
        sql = `SELECT a.*, a.owner_id AS subject_id
                 FROM owner_activities a
                WHERE a.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR a.company_id = $1)
                  AND ($2::uuid IS NULL OR a.id > $2)
                  AND ($4::uuid IS NULL OR a.id = $4)
                ORDER BY a.id LIMIT $3`;
        break;
      case "tenant_activity":
        sql = `SELECT a.*, a.tenant_id AS subject_id
                 FROM tenant_activities a
                WHERE a.deleted_at IS NULL
                  AND ($1::uuid IS NULL OR a.company_id = $1)
                  AND ($2::uuid IS NULL OR a.id > $2)
                  AND ($4::uuid IS NULL OR a.id = $4)
                ORDER BY a.id LIMIT $3`;
        break;
      case "interested_activity":
        sql = `SELECT a.*, ip.company_id, a.interested_profile_id AS subject_id
                 FROM interested_activities a
                 JOIN interested_profiles ip ON ip.id = a.interested_profile_id
                  AND ip.deleted_at IS NULL
                WHERE ($1::uuid IS NULL OR ip.company_id = $1)
                  AND ($2::uuid IS NULL OR a.id > $2)
                  AND ($4::uuid IS NULL OR a.id = $4)
                ORDER BY a.id LIMIT $3`;
        break;
    }
    const rows = (await this.dataSource.query(sql, values)) as Array<
      Record<string, unknown>
    >;
    return rows.map((row) => this.mapAdditionalSource(sourceType, row));
  }

  private mapAdditionalSource(
    sourceType: Exclude<RagSourceEntityType, "property" | "document">,
    row: Record<string, unknown>,
  ): RagSourceEntity {
    const common = {
      id: String(row.id),
      companyId: String(row.company_id),
      updatedAt: new Date(String(row.source_updated_at ?? row.updated_at)),
      sourceType,
    };
    switch (sourceType) {
      case "lease":
        return {
          ...common,
          data: {
            leaseNumber: row.lease_number,
            contractType: row.contract_type,
            propertyId: row.property_id,
            propertyName: row.property_name,
            propertyCity: row.property_city,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            ownerId: row.owner_id,
            ownerName: row.owner_name,
            paymentFrequency: row.payment_frequency,
            termsAndConditions: row.terms_and_conditions,
            specialClauses: row.special_clauses,
            notes: row.notes,
          },
        };
      case "invoice":
        return {
          ...common,
          data: {
            invoiceNumber: row.invoice_number,
            leaseId: row.lease_id,
            leaseNumber: row.lease_number,
            propertyName: row.property_name,
            ownerId: row.owner_id,
            tenantId: row.tenant_id,
            notes: row.notes,
            payments: row.payments,
          },
        };
      case "owner":
        return {
          ...common,
          data: {
            userId: row.user_id,
            ownerName: row.owner_name,
            notes: row.notes,
            properties: row.properties,
          },
        };
      case "tenant_account":
        return {
          ...common,
          data: {
            tenantId: row.tenant_id,
            tenantUserId: row.tenant_user_id,
            tenantName: row.tenant_name,
            leaseId: row.lease_id,
            leaseNumber: row.lease_number,
            propertyId: row.property_id,
            propertyName: row.property_name,
            notes: row.notes,
          },
        };
      case "interested":
        return {
          ...common,
          data: {
            firstName: row.first_name,
            lastName: row.last_name,
            peopleCount: row.people_count,
            hasPets: row.has_pets,
            guaranteeTypes: row.guarantee_types,
            preferredZones: row.preferred_zones,
            preferredCity: row.preferred_city,
            desiredFeatures: row.desired_features,
            propertyTypePreference: row.property_type_preference,
            operation: row.operation,
            operations: row.operations,
            status: row.status,
            qualificationNotes: row.qualification_notes,
            assignedToUserId: row.assigned_to_user_id,
          },
        };
      default:
        return {
          ...common,
          data: {
            type: row.type,
            subject: row.subject,
            body: row.body,
            subjectId: row.subject_id,
            propertyId: row.property_id,
            createdByUserId: row.created_by_user_id,
          },
        };
    }
  }

  private async loadPropertyById(
    companyId: string,
    entityId: string,
  ): Promise<RagSourceEntity[]> {
    const rows = (await this.dataSource.query(
      `SELECT p.*,
              GREATEST(p.updated_at, COALESCE(max(pf.updated_at), p.updated_at)) AS source_updated_at,
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
              GREATEST(d.updated_at, COALESCE(l.updated_at, d.updated_at)) AS source_updated_at,
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
              GREATEST(p.updated_at, COALESCE(max(pf.updated_at), p.updated_at)) AS source_updated_at,
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
              GREATEST(d.updated_at, COALESCE(l.updated_at, d.updated_at)) AS source_updated_at,
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
      updatedAt: new Date(String(row.source_updated_at ?? row.updated_at)),
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
      updatedAt: new Date(String(row.source_updated_at ?? row.updated_at)),
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
