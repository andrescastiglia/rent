import { UserRole } from '../../users/entities/user.entity';
import { AiRagAuditService } from './ai-rag-audit.service';

describe('AiRagAuditService', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const service = new AiRagAuditService(repository as never);

  beforeEach(() => jest.clearAllMocks());

  it('stores a content-free audit with normalized usage and citations', async () => {
    repository.save.mockImplementation(async (value) => ({
      ...value,
      id: 'run-id',
    }));

    await expect(
      service.record({
        context: {
          conversationId: 'conversation-id',
          companyId: 'company-id',
          userId: 'user-id',
          role: UserRole.ADMIN,
        },
        prompt: 'consulta privada',
        strategy: 'hybrid',
        sources: [
          {
            sourceId: 'source-id',
            entityType: 'property',
            entityId: 'property-id',
            label: 'Propiedad',
            content: 'contenido privado',
            origin: 'vector',
            updatedAt: new Date(0).toISOString(),
          },
        ],
        citedIds: ['source-id', 'source-id'],
        insufficientEvidence: false,
        model: 'rag-model',
        usage: { input_tokens: 8, output_tokens: Number.NaN },
        latencyMs: -4.2,
      }),
    ).resolves.toBe('run-id');

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queryHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        retrievedChunkIds: ['source-id'],
        citedChunkIds: ['source-id'],
        inputTokens: 8,
        outputTokens: null,
        latencyMs: 0,
      }),
    );
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain(
      'consulta privada',
    );
    expect(JSON.stringify(repository.create.mock.calls[0][0])).not.toContain(
      'contenido privado',
    );
  });

  it.each([new Error('database down'), 'unknown failure'])(
    'fails open when audit persistence fails',
    async (error) => {
      repository.save.mockRejectedValueOnce(error);
      const logger = (service as unknown as { logger: { error: jest.Mock } })
        .logger;
      jest.spyOn(logger, 'error').mockImplementation(() => undefined);

      await expect(
        service.record({
          context: {
            conversationId: 'conversation-id',
            companyId: 'company-id',
            userId: 'user-id',
            role: UserRole.STAFF,
          },
          prompt: 'consulta',
          strategy: 'semantic',
          sources: [],
          citedIds: [],
          insufficientEvidence: true,
          model: 'rag-model',
          latencyMs: 1.6,
        }),
      ).resolves.toBeNull();
      expect(logger.error).toHaveBeenCalled();
    },
  );
});
