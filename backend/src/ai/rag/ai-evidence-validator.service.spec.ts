import { AiEvidenceValidatorService } from './ai-evidence-validator.service';
import { AiRagSource } from './ai-rag.types';

const source = (origin: 'structured' | 'vector'): AiRagSource => ({
  sourceId: '11111111-1111-4111-8111-111111111111',
  entityType: 'property',
  entityId: '22222222-2222-4222-8222-222222222222',
  label: 'Propiedad',
  updatedAt: new Date(0).toISOString(),
  content: 'contenido',
  origin,
});

describe('AiEvidenceValidatorService', () => {
  const service = new AiEvidenceValidatorService({} as never);

  it('accepts claims whose citations belong to retrieved evidence', () => {
    const evidence = source('vector');
    const answer = service.validate(
      {
        answer: 'Admite mascotas.',
        insufficientEvidence: false,
        claims: [{ text: 'Admite mascotas.', sourceIds: [evidence.sourceId] }],
        suggestedAction: null,
      },
      [evidence],
    );
    expect(answer.insufficientEvidence).toBe(false);
  });

  it('does not over-abstain when every returned claim is grounded', () => {
    const evidence = source('vector');
    const answer = service.validate(
      {
        answer: 'Admite mascotas.',
        insufficientEvidence: true,
        claims: [{ text: 'Admite mascotas.', sourceIds: [evidence.sourceId] }],
        suggestedAction: null,
      },
      [evidence],
    );
    expect(answer.insufficientEvidence).toBe(false);
  });

  it('abstains on an invented citation', () => {
    const answer = service.validate(
      {
        answer: 'Dato inventado',
        insufficientEvidence: false,
        claims: [
          {
            text: 'Dato inventado',
            sourceIds: ['33333333-3333-4333-8333-333333333333'],
          },
        ],
        suggestedAction: null,
      },
      [source('vector')],
    );
    expect(answer.insufficientEvidence).toBe(true);
  });

  it('requires structured evidence for numbers and states', () => {
    const evidence = source('vector');
    const answer = service.validate(
      {
        answer: 'El saldo es 100.',
        insufficientEvidence: false,
        claims: [{ text: 'El saldo es 100.', sourceIds: [evidence.sourceId] }],
        suggestedAction: null,
      },
      [evidence],
    );
    expect(answer.insufficientEvidence).toBe(true);
  });

  it('revalidates vector sources against operational rows and timestamps', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ id: source('vector').sourceId }]);
    const validator = new AiEvidenceValidatorService({ query } as never);
    const evidence = source('vector');

    await expect(
      validator.filterFreshVectorSources(
        [evidence],
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toEqual([evidence]);
    expect(query.mock.calls[0][0]).toContain(
      'p.updated_at <= c.source_updated_at',
    );
    expect(query.mock.calls[0][0]).toContain("WHEN 'invoice_payment_summary'");
    expect(query.mock.calls[0][0]).toContain("WHEN 'activity_chunk'");
  });
});
