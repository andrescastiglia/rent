import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRole } from '../../users/entities/user.entity';
import { AiQueryEmbeddingService } from './ai-query-embedding.service';
import { AiRagContext, AiRagSource } from './ai-rag.types';

type VectorRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  metadata: Record<string, unknown> | null;
  source_updated_at: Date | string;
  similarity: string | number;
};

@Injectable()
export class AiVectorRetrieverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly embeddings: AiQueryEmbeddingService,
  ) {}

  async retrieve(
    prompt: string,
    context: AiRagContext,
  ): Promise<AiRagSource[]> {
    const configuredThreshold = process.env.AI_RAG_MIN_SIMILARITY;
    if (!configuredThreshold) {
      throw new ServiceUnavailableException(
        'AI_RAG_MIN_SIMILARITY must be calibrated and configured',
      );
    }
    const threshold = Number(configuredThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new ServiceUnavailableException(
        'AI_RAG_MIN_SIMILARITY must be between 0 and 1',
      );
    }
    const limit = Math.min(
      Math.max(Number(process.env.AI_RAG_TOP_K ?? 8), 1),
      20,
    );
    const embedding = await this.embeddings.embed(prompt);
    const vector = `[${embedding.join(',')}]`;
    const roleFilter = this.roleFilter(context);

    const rows = await this.dataSource.query<VectorRow[]>(
      `SELECT c.id, c.entity_type, c.entity_id, c.content, c.metadata,
              c.source_updated_at, 1 - (c.embedding <=> $1::vector) AS similarity
         FROM ai_knowledge_chunks c
        WHERE c.company_id = $2::uuid
          AND c.deleted_at IS NULL
          AND c.embedding IS NOT NULL
          AND c.entity_type = ANY($3::varchar[])
          AND $4::uuid IS NOT NULL
          AND $5::text IS NOT NULL
          AND (${roleFilter})
          AND 1 - (c.embedding <=> $1::vector) >= $6
        ORDER BY c.embedding <=> $1::vector
        LIMIT $7`,
      [
        vector,
        context.companyId,
        ['property_summary', 'document_chunk'],
        context.userId,
        context.role,
        threshold,
        limit,
      ],
    );

    return rows.map((row) => ({
      sourceId: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: this.label(row),
      updatedAt: new Date(row.source_updated_at).toISOString(),
      content: row.content.slice(0, 5000),
      origin: 'vector',
    }));
  }

  async filterAuthorized(
    sources: AiRagSource[],
    context: AiRagContext,
  ): Promise<AiRagSource[]> {
    const vectorSources = sources.filter(
      (source) => source.origin === 'vector',
    );
    if (vectorSources.length === 0) return sources;
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT c.id
         FROM ai_knowledge_chunks c
        WHERE c.id = ANY($1::uuid[])
          AND c.company_id = $2::uuid
          AND c.entity_type = ANY($3::varchar[])
          AND c.deleted_at IS NULL
          AND c.embedding IS NOT NULL
          AND $4::uuid IS NOT NULL
          AND $5::text IS NOT NULL
          AND (${this.roleFilter(context)})`,
      [
        vectorSources.map((source) => source.sourceId),
        context.companyId,
        ['property_summary', 'document_chunk'],
        context.userId,
        context.role,
      ],
    );
    const authorized = new Set(rows.map((row) => row.id));
    return sources.filter(
      (source) => source.origin !== 'vector' || authorized.has(source.sourceId),
    );
  }

  private roleFilter(context: AiRagContext): string {
    const role = context.role;
    if (role === UserRole.ADMIN) return 'TRUE';
    if (role === UserRole.STAFF) {
      const permissions = context.permissions;
      if (!permissions || Object.keys(permissions).length === 0) return 'TRUE';
      return permissions.properties || permissions.leases ? 'TRUE' : 'FALSE';
    }
    if (role === UserRole.OWNER) {
      return `(
        (c.entity_type = 'property_summary' AND EXISTS (
          SELECT 1 FROM properties p JOIN owners o ON o.id = p.owner_id
           WHERE p.id = c.entity_id AND p.deleted_at IS NULL
             AND o.deleted_at IS NULL AND o.user_id = $4::uuid
        )) OR
        (c.entity_type = 'document_chunk' AND EXISTS (
          SELECT 1 FROM documents d
           WHERE d.id = c.entity_id AND d.deleted_at IS NULL AND (
             (d.entity_type = 'property' AND EXISTS (
               SELECT 1 FROM properties p JOIN owners o ON o.id = p.owner_id
                WHERE p.id = d.entity_id AND p.deleted_at IS NULL
                  AND o.deleted_at IS NULL AND o.user_id = $4::uuid
             )) OR
             (d.entity_type = 'lease' AND EXISTS (
               SELECT 1 FROM leases l JOIN owners o ON o.id = l.owner_id
                WHERE l.id = d.entity_id AND l.deleted_at IS NULL
                  AND o.deleted_at IS NULL AND o.user_id = $4::uuid
             ))
           )
        ))
      )`;
    }
    if (role === UserRole.TENANT) {
      return `(
        (c.entity_type = 'property_summary' AND EXISTS (
          SELECT 1 FROM leases l JOIN tenants t ON t.id = l.tenant_id
           WHERE l.property_id = c.entity_id AND l.deleted_at IS NULL
             AND t.deleted_at IS NULL AND t.user_id = $4::uuid
        )) OR
        (c.entity_type = 'document_chunk' AND EXISTS (
          SELECT 1 FROM documents d
           WHERE d.id = c.entity_id AND d.deleted_at IS NULL AND (
             (d.entity_type = 'property' AND EXISTS (
               SELECT 1 FROM leases l JOIN tenants t ON t.id = l.tenant_id
                WHERE l.property_id = d.entity_id AND l.deleted_at IS NULL
                  AND t.deleted_at IS NULL AND t.user_id = $4::uuid
             )) OR
             (d.entity_type = 'lease' AND EXISTS (
               SELECT 1 FROM leases l JOIN tenants t ON t.id = l.tenant_id
                WHERE l.id = d.entity_id AND l.deleted_at IS NULL
                  AND t.deleted_at IS NULL AND t.user_id = $4::uuid
             ))
           )
        ))
      )`;
    }
    return 'FALSE';
  }

  private label(row: VectorRow): string {
    const label =
      row.metadata?.label ?? row.metadata?.name ?? row.metadata?.title;
    return typeof label === 'string' && label.trim()
      ? label.slice(0, 200)
      : `${row.entity_type}:${row.entity_id}`;
  }
}
