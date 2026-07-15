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
      `SELECT id FROM ai_knowledge_chunks
        WHERE company_id = $1::uuid AND id = ANY($2::uuid[])
          AND deleted_at IS NULL AND embedding IS NOT NULL`,
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
