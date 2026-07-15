import { UserRole } from '../../users/entities/user.entity';
import { AiStructuredRetrieverService } from './ai-structured-retriever.service';

describe('AiStructuredRetrieverService registry', () => {
  it('parameterizes and filters available properties in SQL', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiStructuredRetrieverService({ query } as never);
    const sources = await service.retrieve(
      '¿Qué propiedades hay disponibles?',
      {
        userId: '10000000-0000-0000-0000-000000000101',
        companyId: '10000000-0000-0000-0000-000000000001',
        conversationId: '33333333-3333-4333-8333-333333333333',
        role: UserRole.ADMIN,
      },
    );
    expect(query.mock.calls[0][0]).toContain(
      "p.operation_state::text = 'available'",
    );
    expect(query.mock.calls[0][1]).toEqual([
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101',
      null,
      20,
      true,
    ]);
    expect(sources).toEqual([
      expect.objectContaining({
        entityType: 'structured_query',
        entityId: '10000000-0000-0000-0000-000000000001',
        origin: 'structured',
      }),
    ]);
  });

  it('fails closed for staff without the module permission', async () => {
    const query = jest.fn();
    const service = new AiStructuredRetrieverService({ query } as never);
    await expect(
      service.retrieve('lista de propiedades disponibles', {
        userId: '10000000-0000-0000-0000-000000000101',
        companyId: '10000000-0000-0000-0000-000000000001',
        conversationId: '33333333-3333-4333-8333-333333333333',
        role: UserRole.STAFF,
        permissions: { properties: false },
      }),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
