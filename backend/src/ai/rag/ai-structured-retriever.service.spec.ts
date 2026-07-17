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

  it.each([
    ['Listá las propiedades en venta con sus importes', 'FROM properties p'],
    ['Indicá el precio de cada propiedad', 'FROM properties p'],
    ['¿Cuál es el monto mensual de mi alquiler?', 'FROM leases l'],
    ['Indicá el importe correspondiente al canon', 'FROM leases l'],
  ])(
    'routes domain-specific amounts without confusing them with invoices',
    async (prompt, expectedSql) => {
      const query = jest.fn().mockResolvedValue([]);
      const service = new AiStructuredRetrieverService({ query } as never);

      await service.retrieve(prompt, {
        userId: '10000000-0000-0000-0000-000000000101',
        companyId: '10000000-0000-0000-0000-000000000001',
        conversationId: '33333333-3333-4333-8333-333333333333',
        role: UserRole.ADMIN,
      });

      expect(query.mock.calls[0][0]).toContain(expectedSql);
    },
  );

  it.each([
    ['Mostrá el dashboard', 'Dashboard actual'],
    ['¿Cuál es mi saldo?', 'FROM tenant_accounts a'],
    ['Listá los pagos', 'FROM payments pay'],
    ['Listá las facturas vencidas', 'FROM invoices i'],
    ['¿Cuál es el estado del contrato?', 'FROM leases l'],
  ])('routes %s to its registered query', async (prompt, expectedSql) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiStructuredRetrieverService({ query } as never);

    await service.retrieve(prompt, {
      userId: '10000000-0000-0000-0000-000000000101',
      companyId: '10000000-0000-0000-0000-000000000001',
      conversationId: '33333333-3333-4333-8333-333333333333',
      role: UserRole.ADMIN,
    });

    expect(query.mock.calls[0][0]).toContain(expectedSql);
  });

  it.each([
    [UserRole.OWNER, 'Listá los pagos', 'o.id = i.owner_id'],
    [UserRole.TENANT, 'Listá los pagos', 't.id = pay.tenant_id'],
    [UserRole.BUYER, 'Listá propiedades', 'AND (FALSE)'],
  ])('applies the %s role scope', async (role, prompt, expectedSql) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiStructuredRetrieverService({ query } as never);

    await service.retrieve(prompt, {
      userId: '10000000-0000-0000-0000-000000000101',
      companyId: '10000000-0000-0000-0000-000000000001',
      conversationId: '33333333-3333-4333-8333-333333333333',
      role,
    });

    expect(query.mock.calls[0][0]).toContain(expectedSql);
  });

  it.each([
    ['Listá las facturas', { invoices: true }],
    ['Listá los pagos', { payments: true }],
    ['Mostrá el saldo', { tenants: true }],
    ['Mostrá el contrato', { leases: true }],
    ['Mostrá el dashboard', { dashboard: true }],
    ['Listá propiedades', { properties: true }],
  ])('allows staff to run %s with permission', async (prompt, permissions) => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiStructuredRetrieverService({ query } as never);

    await service.retrieve(prompt, {
      userId: '10000000-0000-0000-0000-000000000101',
      companyId: '10000000-0000-0000-0000-000000000001',
      conversationId: '33333333-3333-4333-8333-333333333333',
      role: UserRole.STAFF,
      permissions,
    });

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('never interpolates prompt content into a registered SQL query', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new AiStructuredRetrieverService({ query } as never);
    const entityId = '20000000-0000-4000-8000-000000000999';
    const injection = `Mostrá facturas de ${entityId}'); DROP TABLE invoices; --`;

    await service.retrieve(injection, {
      userId: '10000000-0000-0000-0000-000000000101',
      companyId: '10000000-0000-0000-0000-000000000001',
      conversationId: '33333333-3333-4333-8333-333333333333',
      role: UserRole.ADMIN,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain(injection);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('$3::uuid');
    expect(params).toEqual([
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000101',
      entityId,
      20,
      false,
    ]);
  });
});
