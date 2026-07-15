import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/entities/user.entity';
import { AiRagOrchestratorService } from './ai-rag-orchestrator.service';
import { AiRagSource } from './ai-rag.types';

const source = (id: string): AiRagSource => ({
  sourceId: id,
  entityType: 'property',
  entityId: `entity-${id}`,
  label: id,
  content: `content-${id}`,
  origin: 'vector',
  updatedAt: new Date(0).toISOString(),
});

describe('AiRagOrchestratorService', () => {
  const conversation = { id: 'conversation-id', messages: [], toolState: {} };
  const conversations = {
    getOrCreateConversation: jest.fn(),
    toOpenAiHistory: jest.fn(),
    appendExchange: jest.fn(),
    appendAssistantError: jest.fn(),
  };
  const legacy = { respond: jest.fn() };
  const classifier = { classify: jest.fn() };
  const vector = { retrieve: jest.fn(), filterAuthorized: jest.fn() };
  const structured = { retrieve: jest.fn() };
  const validator = {
    filterFreshVectorSources: jest.fn(),
    sanitize: jest.fn(),
    abstention: jest.fn(),
    validate: jest.fn(),
  };
  const generator = { generate: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new AiRagOrchestratorService(
    conversations as never,
    legacy as never,
    classifier as never,
    vector as never,
    structured as never,
    validator as never,
    generator as never,
    audit as never,
  );
  const params = {
    prompt: 'consulta',
    context: {
      userId: 'user-id',
      companyId: 'company-id',
      role: UserRole.ADMIN,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    conversations.getOrCreateConversation.mockResolvedValue(conversation);
    conversations.toOpenAiHistory.mockReturnValue([
      { role: 'user', content: 'previa' },
    ]);
    conversations.appendExchange.mockResolvedValue({
      ...conversation,
      toolState: { page: 2 },
    });
    conversations.appendAssistantError.mockResolvedValue(undefined);
    validator.filterFreshVectorSources.mockImplementation(
      async (items) => items,
    );
    vector.filterAuthorized.mockImplementation(async (items) => items);
    validator.sanitize.mockImplementation((items) => items);
    validator.abstention.mockReturnValue({
      answer: 'Sin evidencia',
      insufficientEvidence: true,
      claims: [],
      suggestedAction: null,
    });
    validator.validate.mockImplementation((answer) => answer);
    audit.record.mockResolvedValue('rag-run-id');
  });

  it('uses the legacy mutation path and persists an allowed exchange', async () => {
    classifier.classify.mockReturnValue('mutation');
    legacy.respond.mockResolvedValue({
      model: 'tools-model',
      outputText: 'hecho',
    });

    const result = await service.respond(params);

    expect(legacy.respond).toHaveBeenCalledWith(
      params.prompt,
      expect.objectContaining({ conversationId: conversation.id }),
      expect.any(Array),
    );
    expect(result).toMatchObject({
      outputText: 'hecho',
      insufficientEvidence: false,
      toolState: { page: 2 },
      retrieval: { strategy: 'structured', resultCount: 0 },
    });
  });

  it('rejects owner mutations and records the assistant error', async () => {
    classifier.classify.mockReturnValue('mutation');

    await expect(
      service.respond({
        ...params,
        context: { ...params.context, role: UserRole.OWNER },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(conversations.appendAssistantError).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantError: expect.stringContaining('read-only'),
      }),
    );
  });

  it.each(['structured', 'semantic'] as const)(
    'retrieves, validates and publishes cited %s evidence',
    async (strategy) => {
      const evidence = source('source-1');
      classifier.classify.mockReturnValue(strategy);
      structured.retrieve.mockResolvedValue([evidence]);
      vector.retrieve.mockResolvedValue([evidence]);
      generator.generate.mockResolvedValue({
        answer: {
          answer: 'respuesta',
          insufficientEvidence: false,
          claims: [{ text: 'respuesta', sourceIds: [evidence.sourceId] }],
          suggestedAction: null,
        },
        model: 'rag-model',
        usage: { input_tokens: 3, output_tokens: 2 },
      });

      const result = await service.respond(params);

      expect(result).toMatchObject({
        model: 'rag-model',
        outputText: 'respuesta',
        sources: [expect.objectContaining({ sourceId: evidence.sourceId })],
        retrieval: { strategy, resultCount: 1 },
        ragRunId: 'rag-run-id',
        usage: { input_tokens: 3, output_tokens: 2 },
      });
      expect(result.sources[0]).not.toHaveProperty('content');
    },
  );

  it('merges duplicate hybrid sources and can avoid conversation persistence', async () => {
    const first = source('source-1');
    const second = source('source-2');
    classifier.classify.mockReturnValue('hybrid');
    structured.retrieve.mockResolvedValue([first]);
    vector.retrieve.mockResolvedValue([first, second]);
    generator.generate.mockResolvedValue({
      answer: {
        answer: 'híbrida',
        insufficientEvidence: false,
        claims: [{ text: 'híbrida', sourceIds: [second.sourceId] }],
        suggestedAction: null,
      },
      model: 'rag-model',
    });

    const result = await service.respond({
      ...params,
      persistConversation: false,
    });

    expect(generator.generate).toHaveBeenCalledWith({
      prompt: params.prompt,
      sources: [first, second],
    });
    expect(conversations.appendExchange).not.toHaveBeenCalled();
    expect(result.sources).toEqual([
      expect.objectContaining({ sourceId: second.sourceId }),
    ]);
  });

  it('returns a validated abstention for unsupported prompts', async () => {
    classifier.classify.mockReturnValue('unsupported');
    validator.validate.mockReturnValue({
      answer: 'Sin evidencia',
      insufficientEvidence: true,
      claims: [],
      suggestedAction: null,
    });

    const result = await service.respond({ ...params, history: [] });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      model: 'none',
      insufficientEvidence: true,
      retrieval: { strategy: 'semantic', resultCount: 0 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: 'unsupported',
        insufficientEvidence: true,
      }),
    );
  });

  it('does not persist an error when persistence is disabled', async () => {
    classifier.classify.mockReturnValue('semantic');
    vector.retrieve.mockRejectedValue(new Error('vector unavailable'));

    await expect(
      service.respond({ ...params, persistConversation: false }),
    ).rejects.toThrow('vector unavailable');
    expect(conversations.appendAssistantError).not.toHaveBeenCalled();
  });
});
