import { CompanyFinancialSettingsService } from './company-financial-settings.service';
import { CompanyFinancialSettingsController } from './company-financial-settings.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

function fixture(
  financial: Record<string, unknown> | undefined = {
    commissionTaxRate: 21,
    commissionTaxRateSource: 'legacy-policy',
  },
) {
  const company = {
    settings: { timezone: 'America/Argentina/Buenos_Aires', financial },
  };
  const manager = {
    query: jest.fn(async (sql: string, _params?: unknown[]) =>
      sql.startsWith('SELECT settings') ? [company] : [],
    ),
  };
  const db = {
    query: jest.fn().mockResolvedValue([company]),
    transaction: jest.fn(async (work) => work(manager)),
  };
  return {
    company,
    db,
    manager,
    service: new CompanyFinancialSettingsService(db as never),
  };
}
const dto = {
  commissionTaxRate: 0.29,
  source: 'Configuración fiscal comprobada',
  effectiveFrom: '2026-01-01',
};

describe('Company financial settings', () => {
  it('reports the configured rate and its provenance', async () => {
    const f = fixture();
    expect(await f.service.get('company')).toEqual({
      configured: true,
      commissionTaxRate: 21,
      source: 'legacy-policy',
      effectiveFrom: null,
    });
    expect(f.db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id=$1'),
      ['company'],
    );
  });
  it('distinguishes a missing parameter from a configured zero rate', async () => {
    const missing = fixture({});
    expect(await missing.service.get('company')).toMatchObject({
      configured: false,
      commissionTaxRate: null,
    });
    const exempt = fixture({
      commissionTaxRate: 0,
      source: 'Exención declarada',
      effectiveFrom: '2026-01-01',
    });
    expect(await exempt.service.get('company')).toMatchObject({
      configured: true,
      commissionTaxRate: 0,
      source: 'Exención declarada',
      effectiveFrom: '2026-01-01',
    });
  });
  it('rejects nonexistent and foreign-scoped companies', async () => {
    const f = fixture();
    f.db.query.mockResolvedValue([]);
    await expect(f.service.get('missing')).rejects.toThrow('Company not found');
    f.manager.query.mockResolvedValue([]);
    await expect(f.service.update('missing', 'actor', dto)).rejects.toThrow(
      'Company not found',
    );
  });
  it('locks company settings and records the old and new policy in the same transaction', async () => {
    const f = fixture({ commissionTaxRate: 21, custom: 'preserved' });
    expect(await f.service.update('company', 'actor', dto)).toEqual({
      configured: true,
      ...dto,
    });
    expect(f.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['company'],
    );
    const audit = f.manager.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO company_financial_settings_audit'),
    );
    expect(audit?.[1]).toEqual([
      'company',
      'actor',
      JSON.stringify({ commissionTaxRate: 21, custom: 'preserved' }),
      JSON.stringify({
        commissionTaxRate: 0.29,
        custom: 'preserved',
        source: dto.source,
        effectiveFrom: dto.effectiveFrom,
        commissionTaxRateSource: dto.source,
      }),
    ]);
  });
  it.each([
    { commissionTaxRate: -1 },
    { commissionTaxRate: 101 },
    { commissionTaxRate: 0.001 },
    { source: 'x' },
    { effectiveFrom: '2026-02-30' },
    { effectiveFrom: '2080-01-01' },
  ])('rejects an invalid policy %s before writing', async (changes) => {
    const f = fixture();
    await expect(
      f.service.update('company', 'actor', { ...dto, ...changes }),
    ).rejects.toThrow();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('propagates audit failures so the surrounding transaction can roll back', async () => {
    const f = fixture();
    f.manager.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT settings')) return [f.company];
      if (sql.includes('INSERT INTO company_financial_settings_audit'))
        throw new Error('audit unavailable');
      return [];
    });
    await expect(f.service.update('company', 'actor', dto)).rejects.toThrow(
      'audit unavailable',
    );
  });
  it('authorizes only administrators and passes the stable request key to the domain', async () => {
    const service = { get: jest.fn(), update: jest.fn() },
      controller = new CompanyFinancialSettingsController(service as never);
    expect(
      Reflect.getMetadata(ROLES_KEY, CompanyFinancialSettingsController),
    ).toEqual([UserRole.ADMIN]);
    controller.get({ user: { companyId: 'company' } });
    controller.update(
      dto,
      { user: { companyId: 'company', id: 'actor' } },
      'request-key',
    );
    expect(service.get).toHaveBeenCalledWith('company');
    expect(service.update).toHaveBeenCalledWith(
      'company',
      'actor',
      dto,
      'request-key',
    );
  });
});
