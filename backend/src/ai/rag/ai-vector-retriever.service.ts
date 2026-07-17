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

export const AI_RAG_VECTOR_PROJECTIONS = [
  'property_summary',
  'document_chunk',
  'lease_summary',
  'invoice_payment_summary',
  'owner_portfolio_summary',
  'tenant_account_summary',
  'interested_profile_summary',
  'activity_chunk',
] as const;

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
    const roleThreshold =
      process.env[`AI_RAG_MIN_SIMILARITY_${context.role.toUpperCase()}`];
    const configuredThreshold =
      roleThreshold ?? process.env.AI_RAG_MIN_SIMILARITY;
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
    const topK = Math.min(
      Math.max(Number(process.env.AI_RAG_TOP_K ?? 8), 1),
      20,
    );
    const candidateLimit = Math.min(topK * 3, 60);
    const embedding = await this.embeddings.embed(prompt);
    const vector = `[${embedding.join(',')}]`;
    const roleFilter = this.roleFilter(context);
    const projectionThresholds = this.projectionThresholds();

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
          AND 1 - (c.embedding <=> $1::vector) >= COALESCE(
            NULLIF($8::jsonb->>c.entity_type, '')::double precision,
            $6
          )
        ORDER BY c.embedding <=> $1::vector
        LIMIT $7`,
      [
        vector,
        context.companyId,
        AI_RAG_VECTOR_PROJECTIONS,
        context.userId,
        context.role,
        threshold,
        candidateLimit,
        JSON.stringify(projectionThresholds),
      ],
    );

    return this.rerank(
      rows.map((row) => ({
        sourceId: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        label: this.label(row),
        updatedAt: new Date(row.source_updated_at).toISOString(),
        content: row.content.slice(0, 5000),
        origin: 'vector',
        retrievalScore: Number(row.similarity),
      })),
      topK,
    );
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
        AI_RAG_VECTOR_PROJECTIONS,
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
      if (!permissions || Object.keys(permissions).length === 0) return 'FALSE';
      const clauses: string[] = [];
      if (permissions.properties) {
        clauses.push("c.entity_type = 'property_summary'");
      }
      if (permissions.owners) {
        clauses.push("c.entity_type = 'owner_portfolio_summary'");
      }
      if (permissions.interested) {
        clauses.push("c.entity_type = 'interested_profile_summary'");
      }
      if (permissions.leases) {
        clauses.push("c.entity_type IN ('lease_summary', 'document_chunk')");
      }
      if (permissions.invoices || permissions.payments) {
        clauses.push("c.entity_type = 'invoice_payment_summary'");
      }
      if (permissions.tenants || permissions.payments) {
        clauses.push("c.entity_type = 'tenant_account_summary'");
      }
      const activityTypes: string[] = [];
      if (permissions.owners) activityTypes.push("'owner_activity'");
      if (permissions.tenants) activityTypes.push("'tenant_activity'");
      if (permissions.interested) activityTypes.push("'interested_activity'");
      if (activityTypes.length) {
        clauses.push(
          `(c.entity_type = 'activity_chunk' AND c.metadata->>'activitySourceType' IN (${activityTypes.join(', ')}))`,
        );
      }
      return clauses.length ? `(${clauses.join(' OR ')})` : 'FALSE';
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
        )) OR
        (c.entity_type = 'lease_summary' AND EXISTS (
          SELECT 1 FROM leases l JOIN owners o ON o.id = l.owner_id
           WHERE l.id = c.entity_id AND l.deleted_at IS NULL
             AND o.deleted_at IS NULL AND o.user_id = $4::uuid
        )) OR
        (c.entity_type = 'invoice_payment_summary' AND EXISTS (
          SELECT 1 FROM invoices i JOIN owners o ON o.id = i.owner_id
           WHERE i.id = c.entity_id AND i.deleted_at IS NULL
             AND o.deleted_at IS NULL AND o.user_id = $4::uuid
        )) OR
        (c.entity_type = 'owner_portfolio_summary' AND EXISTS (
          SELECT 1 FROM owners o WHERE o.id = c.entity_id
            AND o.deleted_at IS NULL AND o.user_id = $4::uuid
        )) OR
        (c.entity_type = 'activity_chunk'
          AND c.metadata->>'activitySourceType' = 'owner_activity'
          AND EXISTS (
            SELECT 1 FROM owner_activities a JOIN owners o ON o.id = a.owner_id
             WHERE a.id = c.entity_id AND a.deleted_at IS NULL
               AND o.deleted_at IS NULL AND o.user_id = $4::uuid
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
        )) OR
        (c.entity_type = 'lease_summary' AND EXISTS (
          SELECT 1 FROM leases l JOIN tenants t ON t.id = l.tenant_id
           WHERE l.id = c.entity_id AND l.deleted_at IS NULL
             AND t.deleted_at IS NULL AND t.user_id = $4::uuid
        )) OR
        (c.entity_type = 'invoice_payment_summary' AND EXISTS (
          SELECT 1 FROM invoices i JOIN leases l ON l.id = i.lease_id
          JOIN tenants t ON t.id = l.tenant_id
           WHERE i.id = c.entity_id AND i.deleted_at IS NULL
             AND l.deleted_at IS NULL AND t.deleted_at IS NULL
             AND t.user_id = $4::uuid
        )) OR
        (c.entity_type = 'tenant_account_summary' AND EXISTS (
          SELECT 1 FROM tenant_accounts a JOIN tenants t ON t.id = a.tenant_id
           WHERE a.id = c.entity_id AND a.deleted_at IS NULL
             AND t.deleted_at IS NULL AND t.user_id = $4::uuid
        )) OR
        (c.entity_type = 'activity_chunk'
          AND c.metadata->>'activitySourceType' = 'tenant_activity'
          AND EXISTS (
            SELECT 1 FROM tenant_activities a JOIN tenants t ON t.id = a.tenant_id
             WHERE a.id = c.entity_id AND a.deleted_at IS NULL
               AND t.deleted_at IS NULL AND t.user_id = $4::uuid
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

  private rerank(sources: AiRagSource[], topK: number): AiRagSource[] {
    const finalK = Math.min(
      Math.max(Number(process.env.AI_RAG_FINAL_K ?? topK), 1),
      topK,
    );
    const perEntity = new Map<string, number>();
    return [...sources]
      .sort((left, right) => {
        const scoreDelta =
          (right.retrievalScore ?? 0) - (left.retrievalScore ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        return left.sourceId.localeCompare(right.sourceId);
      })
      .filter((source) => {
        const key = `${source.entityType}:${source.entityId}`;
        const count = perEntity.get(key) ?? 0;
        if (count >= 2) return false;
        perEntity.set(key, count + 1);
        return true;
      })
      .slice(0, finalK);
  }

  private projectionThresholds(): Record<string, number> {
    const raw = process.env.AI_RAG_MIN_SIMILARITY_BY_PROJECTION?.trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(parsed).map(([projection, value]) => {
          if (
            !AI_RAG_VECTOR_PROJECTIONS.includes(projection as never) ||
            typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 1
          ) {
            throw new Error('invalid projection threshold');
          }
          return [projection, value];
        }),
      );
    } catch {
      throw new ServiceUnavailableException(
        'AI_RAG_MIN_SIMILARITY_BY_PROJECTION must be a valid projection-to-number JSON object',
      );
    }
  }
}
