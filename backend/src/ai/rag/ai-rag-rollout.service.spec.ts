import { UserRole } from '../../users/entities/user.entity';
import { AiRagRolloutService } from './ai-rag-rollout.service';

describe('AiRagRolloutService', () => {
  const originalMode = process.env.AI_RETRIEVAL_MODE;
  const originalCompanies = process.env.AI_RAG_ENABLED_COMPANY_IDS;
  const conversation = {
    id: '33333333-3333-4333-8333-333333333333',
    messages: [],
    toolState: {},
  };
  const conversations = {
    getOrCreateConversation: jest.fn().mockResolvedValue(conversation),
    toOpenAiHistory: jest.fn().mockReturnValue([]),
    appendExchange: jest.fn().mockResolvedValue(conversation),
    appendAssistantError: jest.fn(),
  };
  const legacy = {
    respond: jest.fn().mockResolvedValue({
      model: 'tools-model',
      outputText: 'legacy answer',
    }),
  };
  const rag = {
    respond: jest.fn().mockResolvedValue({
      conversationId: conversation.id,
      model: 'rag-model',
      outputText: 'rag answer',
      insufficientEvidence: false,
      sources: [{ sourceId: '11111111-1111-4111-8111-111111111111' }],
      retrieval: { strategy: 'semantic', resultCount: 1 },
      ragRunId: '22222222-2222-4222-8222-222222222222',
    }),
  };
  const classifier = { classify: jest.fn().mockReturnValue('semantic') };
  const repo = { create: jest.fn((value) => value), save: jest.fn() };
  const params = {
    prompt: 'consulta',
    context: {
      userId: '10000000-0000-0000-0000-000000000101',
      companyId: '10000000-0000-0000-0000-000000000001',
      role: UserRole.ADMIN,
    },
  };

  const service = new AiRagRolloutService(
    conversations as never,
    legacy as never,
    rag as never,
    classifier as never,
    repo as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_RAG_ENABLED_COMPANY_IDS = params.context.companyId;
  });

  afterAll(() => {
    if (originalMode === undefined) delete process.env.AI_RETRIEVAL_MODE;
    else process.env.AI_RETRIEVAL_MODE = originalMode;
    if (originalCompanies === undefined)
      delete process.env.AI_RAG_ENABLED_COMPANY_IDS;
    else process.env.AI_RAG_ENABLED_COMPANY_IDS = originalCompanies;
  });

  it('fails closed to TOOLS when company is not allowlisted', async () => {
    process.env.AI_RETRIEVAL_MODE = 'RAG_READ';
    process.env.AI_RAG_ENABLED_COMPANY_IDS = 'other-company';
    const result = await service.respond(params);
    expect(result.retrievalMode).toBe('TOOLS');
    expect(legacy.respond).toHaveBeenCalled();
    expect(rag.respond).not.toHaveBeenCalled();
  });

  it('serves tools and stores a content-free comparison in shadow mode', async () => {
    process.env.AI_RETRIEVAL_MODE = 'RAG_SHADOW';
    const result = await service.respond(params);
    expect(result.outputText).toBe('legacy answer');
    expect(rag.respond).toHaveBeenCalledWith(
      expect.objectContaining({ persistConversation: false }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'compared',
        toolsOutputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        ragOutputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(JSON.stringify(repo.save.mock.calls[0][0])).not.toContain(
      'legacy answer',
    );
  });

  it('serves RAG in RAG_READ', async () => {
    process.env.AI_RETRIEVAL_MODE = 'RAG_READ';
    const result = await service.respond(params);
    expect(result.outputText).toBe('rag answer');
    expect(result).not.toHaveProperty('ragRunId');
    expect(result.retrievalMode).toBe('RAG_READ');
  });

  it('does not shadow-execute mutations', async () => {
    process.env.AI_RETRIEVAL_MODE = 'RAG_SHADOW';
    classifier.classify.mockReturnValueOnce('mutation');
    await service.respond(params);
    expect(legacy.respond).toHaveBeenCalledTimes(1);
    expect(rag.respond).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
