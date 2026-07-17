import { UserRole } from '../../users/entities/user.entity';
import { AiVectorRetrieverService } from './ai-vector-retriever.service';

describe('AiVectorRetrieverService authorization', () => {
  const previousThreshold = process.env.AI_RAG_MIN_SIMILARITY;

  beforeEach(() => {
    process.env.AI_RAG_MIN_SIMILARITY = '0.5';
  });

  afterAll(() => {
    if (previousThreshold === undefined)
      delete process.env.AI_RAG_MIN_SIMILARITY;
    else process.env.AI_RAG_MIN_SIMILARITY = previousThreshold;
  });

  it.each([
    [UserRole.OWNER, 'owners o'],
    [UserRole.TENANT, 'tenants t'],
  ])('pushes %s authorization into SQL', async (role, fragment) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiVectorRetrieverService(
      { query } as never,
      { embed: jest.fn().mockResolvedValue([0.1, 0.2]) } as never,
    );
    await service.retrieve('consulta', {
      userId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      conversationId: '33333333-3333-4333-8333-333333333333',
      role,
    });
    expect(query.mock.calls[0][0]).toContain(fragment);
    expect(query.mock.calls[0][0]).toContain('c.company_id = $2::uuid');
  });

  it('fails closed when similarity was not calibrated', async () => {
    delete process.env.AI_RAG_MIN_SIMILARITY;
    const service = new AiVectorRetrieverService({} as never, {} as never);
    await expect(
      service.retrieve('consulta', {
        userId: '11111111-1111-4111-8111-111111111111',
        companyId: '22222222-2222-4222-8222-222222222222',
        conversationId: '33333333-3333-4333-8333-333333333333',
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow('must be calibrated');
  });

  it.each(['invalid', '-0.1', '1.1'])(
    'rejects an invalid similarity threshold: %s',
    async (threshold) => {
      process.env.AI_RAG_MIN_SIMILARITY = threshold;
      const service = new AiVectorRetrieverService({} as never, {} as never);
      await expect(
        service.retrieve('consulta', {
          userId: 'user-id',
          companyId: 'company-id',
          conversationId: 'conversation-id',
          role: UserRole.ADMIN,
        }),
      ).rejects.toThrow('between 0 and 1');
    },
  );

  it('maps bounded provider rows into public vector evidence', async () => {
    process.env.AI_RAG_TOP_K = '100';
    const query = jest.fn().mockResolvedValue([
      {
        id: 'source-1',
        entity_type: 'property_summary',
        entity_id: 'property-1',
        content: 'x'.repeat(6000),
        metadata: { name: 'Casa' },
        source_updated_at: new Date(0),
        similarity: '0.9',
      },
      {
        id: 'source-2',
        entity_type: 'document_chunk',
        entity_id: 'document-1',
        content: 'Contrato',
        metadata: null,
        source_updated_at: new Date(0).toISOString(),
        similarity: 0.8,
      },
    ]);
    const service = new AiVectorRetrieverService(
      { query } as never,
      { embed: jest.fn().mockResolvedValue([0.1, 0.2]) } as never,
    );

    const result = await service.retrieve('consulta', {
      userId: 'user-id',
      companyId: 'company-id',
      conversationId: 'conversation-id',
      role: UserRole.ADMIN,
    });

    expect(query.mock.calls[0][1][6]).toBe(60);
    expect(result).toEqual([
      expect.objectContaining({ label: 'Casa', content: 'x'.repeat(5000) }),
      expect.objectContaining({ label: 'document_chunk:document-1' }),
    ]);
    delete process.env.AI_RAG_TOP_K;
  });

  it('filters unauthorized vector sources while retaining structured evidence', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'allowed' }]);
    const service = new AiVectorRetrieverService(
      { query } as never,
      {} as never,
    );
    const context = {
      userId: 'user-id',
      companyId: 'company-id',
      conversationId: 'conversation-id',
      role: UserRole.STAFF,
      permissions: { properties: true },
    };
    const sources = [
      {
        sourceId: 'allowed',
        entityType: 'property',
        entityId: 'property-1',
        label: 'allowed',
        content: 'allowed',
        origin: 'vector' as const,
        updatedAt: new Date(0).toISOString(),
      },
      {
        sourceId: 'denied',
        entityType: 'property',
        entityId: 'property-2',
        label: 'denied',
        content: 'denied',
        origin: 'vector' as const,
        updatedAt: new Date(0).toISOString(),
      },
      {
        sourceId: 'structured',
        entityType: 'structured_query',
        entityId: 'company-id',
        label: 'structured',
        content: 'structured',
        origin: 'structured' as const,
        updatedAt: new Date(0).toISOString(),
      },
    ];

    await expect(service.filterAuthorized(sources, context)).resolves.toEqual([
      sources[0],
      sources[2],
    ]);
    expect(query.mock.calls[0][0]).toContain(
      "c.entity_type = 'property_summary'",
    );
  });

  it('does not query authorization when there are no vector sources', async () => {
    const query = jest.fn();
    const service = new AiVectorRetrieverService(
      { query } as never,
      {} as never,
    );
    const sources = [
      {
        sourceId: 'structured',
        entityType: 'structured_query',
        entityId: 'company-id',
        label: 'structured',
        content: 'structured',
        origin: 'structured' as const,
        updatedAt: new Date(0).toISOString(),
      },
    ];

    await expect(
      service.filterAuthorized(sources, {
        userId: 'user-id',
        companyId: 'company-id',
        conversationId: 'conversation-id',
        role: UserRole.ADMIN,
      }),
    ).resolves.toBe(sources);
    expect(query).not.toHaveBeenCalled();
  });
});
