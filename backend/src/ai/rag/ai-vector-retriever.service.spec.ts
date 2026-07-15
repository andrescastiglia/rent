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
});
