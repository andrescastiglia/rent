import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { AiRagAnswer, AiRagSource } from './ai-rag.types';

export const ragAnswerSchema = z.object({
  answer: z.string(),
  insufficientEvidence: z.boolean(),
  claims: z.array(
    z.object({
      text: z.string(),
      sourceIds: z
        .array(
          z
            .string()
            .regex(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            ),
        )
        .min(1),
    }),
  ),
  suggestedAction: z.string().nullable(),
});

@Injectable()
export class AiEvidenceValidatorService {
  constructor(private readonly dataSource: DataSource) {}

  sanitize(sources: AiRagSource[]): AiRagSource[] {
    return sources.map((source) => ({
      ...source,
      content: source.content
        // The explicit control-character range is intentional input cleanup.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
        .replace(/```/g, "''' ")
        .slice(0, 5000),
    }));
  }

  validate(answer: AiRagAnswer, sources: AiRagSource[]): AiRagAnswer {
    const allowed = new Set(sources.map((source) => source.sourceId));
    const structured = new Set(
      sources
        .filter((source) => source.origin === 'structured')
        .map((source) => source.sourceId),
    );
    const citationValidClaims = answer.claims.filter(
      (claim) =>
        claim.sourceIds.length > 0 &&
        claim.sourceIds.every((sourceId) => allowed.has(sourceId)),
    );
    const groundedClaims = citationValidClaims.filter(
      (claim) =>
        !this.requiresStructuredEvidence(claim.text) ||
        claim.sourceIds.some((sourceId) => structured.has(sourceId)),
    );
    const rejectedClaim = groundedClaims.length !== answer.claims.length;
    if (sources.length === 0 || groundedClaims.length === 0) {
      return this.abstention();
    }
    if (rejectedClaim) {
      if (groundedClaims.length === 0) return this.abstention();
      return {
        answer: groundedClaims.map((claim) => claim.text).join(' '),
        insufficientEvidence: false,
        claims: groundedClaims,
        suggestedAction: answer.suggestedAction,
      };
    }
    // A model may conservatively mark a useful, fully grounded answer as
    // insufficient. Reserve abstention for no evidence or rejected claims;
    // otherwise expose the cited answer as sufficient.
    return { ...answer, insufficientEvidence: false, claims: groundedClaims };
  }

  async filterFreshVectorSources(
    sources: AiRagSource[],
    companyId: string,
  ): Promise<AiRagSource[]> {
    const vectorIds = sources
      .filter((source) => source.origin === 'vector')
      .map((source) => source.sourceId);
    if (vectorIds.length === 0) return sources;
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT c.id
         FROM ai_knowledge_chunks c
        WHERE c.company_id = $1::uuid AND c.id = ANY($2::uuid[])
          AND c.deleted_at IS NULL AND c.embedding IS NOT NULL
          AND CASE c.entity_type
            WHEN 'property_summary' THEN EXISTS (
              SELECT 1 FROM properties p
               WHERE p.id = c.entity_id AND p.company_id = c.company_id
                 AND p.deleted_at IS NULL
                 AND p.updated_at <= c.source_updated_at
                 AND NOT EXISTS (
                   SELECT 1 FROM property_features pf
                    WHERE pf.property_id = p.id
                      AND pf.updated_at > c.source_updated_at
                 )
            )
            WHEN 'document_chunk' THEN EXISTS (
              SELECT 1 FROM documents d
               WHERE d.id = c.entity_id AND d.company_id = c.company_id
                 AND d.deleted_at IS NULL AND d.status = 'approved'
                 AND d.updated_at <= c.source_updated_at
                 AND NOT EXISTS (
                   SELECT 1 FROM leases l
                    WHERE d.entity_type = 'lease' AND l.id = d.entity_id
                      AND l.deleted_at IS NULL
                      AND l.updated_at > c.source_updated_at
                 )
            )
            WHEN 'lease_summary' THEN EXISTS (
              SELECT 1 FROM leases l
              JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
              JOIN owners o ON o.id = l.owner_id AND o.deleted_at IS NULL
              JOIN users ou ON ou.id = o.user_id AND ou.deleted_at IS NULL
              LEFT JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
              LEFT JOIN users tu ON tu.id = t.user_id AND tu.deleted_at IS NULL
               WHERE l.id = c.entity_id AND l.company_id = c.company_id
                 AND l.deleted_at IS NULL
                 AND GREATEST(
                   l.updated_at, p.updated_at, o.updated_at, ou.updated_at,
                   COALESCE(t.updated_at, l.updated_at),
                   COALESCE(tu.updated_at, l.updated_at)
                 ) <= c.source_updated_at
            )
            WHEN 'invoice_payment_summary' THEN EXISTS (
              SELECT 1 FROM invoices i
              JOIN leases l ON l.id = i.lease_id AND l.deleted_at IS NULL
              JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
               WHERE i.id = c.entity_id AND i.company_id = c.company_id
                 AND i.deleted_at IS NULL
                 AND GREATEST(i.updated_at, l.updated_at, p.updated_at) <= c.source_updated_at
                 AND NOT EXISTS (
                   SELECT 1 FROM payments pay
                    WHERE pay.invoice_id = i.id AND pay.deleted_at IS NULL
                      AND pay.updated_at > c.source_updated_at
                 )
            )
            WHEN 'owner_portfolio_summary' THEN EXISTS (
              SELECT 1 FROM owners o
              JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
               WHERE o.id = c.entity_id AND o.company_id = c.company_id
                 AND o.deleted_at IS NULL
                 AND GREATEST(o.updated_at, u.updated_at) <= c.source_updated_at
                 AND NOT EXISTS (
                   SELECT 1 FROM properties p
                    WHERE p.owner_id = o.id AND p.deleted_at IS NULL
                      AND p.updated_at > c.source_updated_at
                 )
            )
            WHEN 'tenant_account_summary' THEN EXISTS (
              SELECT 1 FROM tenant_accounts a
              JOIN tenants t ON t.id = a.tenant_id AND t.deleted_at IS NULL
              JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
              JOIN leases l ON l.id = a.lease_id AND l.deleted_at IS NULL
              JOIN properties p ON p.id = l.property_id AND p.deleted_at IS NULL
               WHERE a.id = c.entity_id AND a.company_id = c.company_id
                 AND a.deleted_at IS NULL
                 AND GREATEST(a.updated_at, t.updated_at, u.updated_at, l.updated_at, p.updated_at)
                     <= c.source_updated_at
            )
            WHEN 'interested_profile_summary' THEN EXISTS (
              SELECT 1 FROM interested_profiles ip
               WHERE ip.id = c.entity_id AND ip.company_id = c.company_id
                 AND ip.deleted_at IS NULL
                 AND ip.updated_at <= c.source_updated_at
            )
            WHEN 'activity_chunk' THEN (
              (c.metadata->>'activitySourceType' = 'owner_activity' AND EXISTS (
                SELECT 1 FROM owner_activities a
                 WHERE a.id = c.entity_id AND a.company_id = c.company_id
                   AND a.deleted_at IS NULL AND a.updated_at <= c.source_updated_at
              )) OR
              (c.metadata->>'activitySourceType' = 'tenant_activity' AND EXISTS (
                SELECT 1 FROM tenant_activities a
                 WHERE a.id = c.entity_id AND a.company_id = c.company_id
                   AND a.deleted_at IS NULL AND a.updated_at <= c.source_updated_at
              )) OR
              (c.metadata->>'activitySourceType' = 'interested_activity' AND EXISTS (
                SELECT 1 FROM interested_activities a
                JOIN interested_profiles ip ON ip.id = a.interested_profile_id
                 WHERE a.id = c.entity_id AND ip.company_id = c.company_id
                   AND ip.deleted_at IS NULL AND a.updated_at <= c.source_updated_at
              ))
            )
            ELSE FALSE
          END`,
      [companyId, vectorIds],
    );
    const fresh = new Set(rows.map((row) => row.id));
    return sources.filter(
      (source) => source.origin !== 'vector' || fresh.has(source.sourceId),
    );
  }

  abstention(): AiRagAnswer {
    return {
      answer:
        'No tengo evidencia suficiente y autorizada para responder con seguridad.',
      insufficientEvidence: true,
      claims: [],
      suggestedAction: null,
    };
  }

  private requiresStructuredEvidence(text: string): boolean {
    return (
      /\b(estado|total|saldo|monto|importe|fecha|vence|vencimiento|cantidad|cu[aá]nt[oa]s?)\b/i.test(
        text,
      ) ||
      /(?:\$|€|ARS|USD)\s*[0-9]|[0-9]+(?:[.,][0-9]+)?\s*(?:propiedades|facturas|pagos|contratos)/i.test(
        text,
      )
    );
  }
}
