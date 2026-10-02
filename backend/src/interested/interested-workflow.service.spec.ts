import { randomUUID } from 'node:crypto';
import { InterestedWorkflowService } from './interested-workflow.service';

describe('Assisted CRM workflows', () => {
  const actor = { id: 'staff', companyId: 'company', role: 'admin' };
  const rows = [
    { phone: ' 123 ', email: 'USER@EXAMPLE.COM', firstName: 'Ana' },
  ];
  const query = jest.fn();
  const manager = { query, queryRunner: { isTransactionActive: true } };
  const db = { query, transaction: jest.fn((execute) => execute(manager)) };
  const interested = {
    withTransaction: jest.fn((_manager, execute) => execute()),
    create: jest.fn(async () => ({ id: 'new-person' })),
  };
  let service: InterestedWorkflowService;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-workflow-secret';
    query.mockImplementation(async (sql: string) =>
      sql.includes("settings->'crmPipeline'") ? [{ pipeline: null }] : [],
    );
    service = new InterestedWorkflowService(db as any, interested as any);
  });
  it('reviews normalized rows against company-scoped identities', async () => {
    const preview = await service.previewImport(rows, actor);
    expect(preview.rows[0]).toMatchObject({
      data: { phone: '123', email: 'user@example.com' },
      duplicateIds: [],
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('company_id=$1'),
      ['company', ['123'], ['user@example.com']],
    );
  });
  it('imports all reviewed rows inside one transaction and records the result', async () => {
    const preview = await service.previewImport(rows, actor);
    const result = await service.applyImport(
      { rows, reviewToken: preview.reviewToken, skipRows: [] },
      actor,
      randomUUID(),
    );
    expect(result.createdIds).toEqual(['new-person']);
    expect(interested.withTransaction).toHaveBeenCalledWith(
      manager,
      expect.any(Function),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interested_workflow_audit'),
      expect.arrayContaining(['company', 'staff', 'import']),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['person:company:email:user@example.com'],
    );
  });
  it('requires an explicit decision for duplicates within the import', async () => {
    const duplicates = [...rows, ...rows];
    const preview = await service.previewImport(duplicates, actor);
    await expect(
      service.applyImport(
        { rows: duplicates, reviewToken: preview.reviewToken, skipRows: [] },
        actor,
        randomUUID(),
      ),
    ).rejects.toThrow('duplicado');
    expect(interested.create).not.toHaveBeenCalled();
    const result = await service.applyImport(
      { rows: duplicates, reviewToken: preview.reviewToken, skipRows: [1] },
      actor,
      randomUUID(),
    );
    expect(result).toEqual({ createdIds: ['new-person'], skippedRows: [1] });
  });
  it('does not apply a changed import or an invalid skipped row', async () => {
    const preview = await service.previewImport(rows, actor);
    await expect(
      service.applyImport(
        {
          rows: [{ phone: 'changed' }],
          reviewToken: preview.reviewToken,
          skipRows: [],
        },
        actor,
        randomUUID(),
      ),
    ).rejects.toThrow('cambiaron');
    await expect(
      service.applyImport(
        { rows, reviewToken: preview.reviewToken, skipRows: [3] },
        actor,
        randomUUID(),
      ),
    ).rejects.toThrow('outside');
    expect(interested.create).not.toHaveBeenCalled();
  });
  it('recovers the original committed import before checking an expired review', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM domain_operation_receipts')
        ? [
            {
              matches: true,
              result: { createdIds: ['original'], skippedRows: [] },
            },
          ]
        : [],
    );
    await expect(
      service.applyImport(
        { rows, reviewToken: 'expired', skipRows: [] },
        actor,
        randomUUID(),
      ),
    ).resolves.toEqual({ createdIds: ['original'], skippedRows: [] });
    expect(interested.create).not.toHaveBeenCalled();
  });
  it('denies external roles and missing execution keys before writes', async () => {
    await expect(
      service.previewImport(rows, { ...actor, role: 'buyer' }),
    ).rejects.toThrow('staff role');
    await expect(
      service.applyImport({ rows, reviewToken: '', skipRows: [] }, actor, ''),
    ).rejects.toThrow('Idempotency-Key');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('requires company-scoped distinct profiles for a merge', async () => {
    await expect(
      service.previewMerge({ targetId: 'same', sourceId: 'same' }, actor),
    ).rejects.toThrow('diferentes');
    await expect(
      service.previewMerge({ targetId: 'target', sourceId: 'foreign' }, actor),
    ).rejects.toThrow('company');
  });
  it('prevents staff from replacing the company pipeline', async () => {
    await expect(
      service.configurePipeline(
        { stages: [] },
        { ...actor, role: 'staff' },
        randomUUID(),
      ),
    ).rejects.toThrow('administrators');
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('returns initial pipeline stages and rejects moves to nonexistent stages', async () => {
    expect((await service.pipeline(actor)).map((stage) => stage.id)).toEqual([
      'new',
      'contacted',
      'visit',
      'qualified',
    ]);
    await expect(
      service.move('person', 'missing', actor, randomUUID()),
    ).rejects.toThrow('Unknown pipeline stage');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE interested_profiles'),
      ),
    ).toBe(false);
  });
});
