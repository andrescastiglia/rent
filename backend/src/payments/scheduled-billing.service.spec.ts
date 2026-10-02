import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ScheduledBillingService } from './scheduled-billing.service';
import { scheduledBillingKey } from './scheduled-billing';

describe('ScheduledBillingService', () => {
  const companyId = '10000000-0000-4000-8000-000000000001';
  const leaseId = '10000000-0000-4000-8000-000000000002';
  const afterLeaseId = '10000000-0000-4000-8000-000000000003';
  const billingDate = '2026-10-01';
  const candidate = (id = leaseId) => ({
    id,
    companyId,
    nextBillingDate: '2026-10-01',
    paymentFrequency: 'monthly',
    paymentDueDay: 10,
    billingFrequency: 'monthly',
    billingDay: null as number | null,
  });
  const setup = (candidates = [candidate()]) => {
    const db = {
      query: jest.fn(async (sql: string, _parameters?: unknown[]) =>
        sql.includes('FROM leases l') ? candidates : [],
      ),
    };
    const invoices = {
      generateForLease: jest
        .fn()
        .mockResolvedValue({ currencyCode: 'ARS', total: '10.05' }),
    };
    return {
      db,
      invoices,
      service: new ScheduledBillingService(db as never, invoices as never),
    };
  };
  const previousToken = process.env.BATCH_BILLING_INTERNAL_TOKEN;
  afterEach(() => {
    if (previousToken === undefined)
      delete process.env.BATCH_BILLING_INTERNAL_TOKEN;
    else process.env.BATCH_BILLING_INTERNAL_TOKEN = previousToken;
  });

  it('requires configuration and compares the complete internal credential', () => {
    const { service } = setup();
    delete process.env.BATCH_BILLING_INTERNAL_TOKEN;
    expect(() => service.assertToken()).toThrow(ServiceUnavailableException);
    process.env.BATCH_BILLING_INTERNAL_TOKEN = '  internal-credential  ';
    expect(() => service.assertToken()).toThrow(UnauthorizedException);
    expect(() => service.assertToken('short')).toThrow(UnauthorizedException);
    expect(() => service.assertToken('internal-credentiaX')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.assertToken('internal-credential')).not.toThrow();
  });

  it.each([
    { billingDate: '2026-02-30' },
    { billingDate, limit: 101 },
    { billingDate, companyId: 'foreign-injection' },
    { billingDate, force: true },
  ])('rejects malformed requests before selecting leases: %j', async (dto) => {
    const f = setup();
    await expect(f.service.process(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(f.db.query).not.toHaveBeenCalled();
    expect(f.invoices.generateForLease).not.toHaveBeenCalled();
  });

  it('scopes candidate selection and returns the last candidate as its cursor', async () => {
    const f = setup([candidate(leaseId), candidate(afterLeaseId)]);
    const result = await f.service.process({
      billingDate,
      companyId,
      leaseId,
      afterLeaseId,
      limit: 2,
    });
    expect(f.db.query.mock.calls[0][1]).toEqual([
      billingDate,
      companyId,
      leaseId,
      afterLeaseId,
      2,
    ]);
    expect(result).toMatchObject({
      processedLeases: 2,
      invoicesProcessed: 2,
      invoicesFailed: 0,
      nextCursor: afterLeaseId,
      totals: [{ currencyCode: 'ARS', amount: '20.10' }],
    });
    expect(f.invoices.generateForLease).toHaveBeenCalledWith(
      leaseId,
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        dueDate: '2026-10-10',
        issue: true,
        applyAdjustment: true,
        applyLateFee: false,
        idempotencyKey: scheduledBillingKey(companyId, leaseId, billingDate),
      },
      companyId,
      { billingDate },
    );
  });

  it('uses bounded defaults and performs no writes for a dry run', async () => {
    const f = setup();
    await expect(
      f.service.process({ billingDate, dryRun: true }),
    ).resolves.toMatchObject({
      invoicesProcessed: 0,
      invoicesSkipped: 1,
      invoicesFailed: 0,
      nextCursor: null,
      totals: [],
    });
    expect(f.db.query).toHaveBeenCalledTimes(1);
    expect(f.db.query.mock.calls[0][1]).toEqual([
      billingDate,
      null,
      null,
      null,
      100,
    ]);
    expect(f.invoices.generateForLease).not.toHaveBeenCalled();
  });

  it('replays the original persisted dates after a lost generation response', async () => {
    const f = setup();
    const request = {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-09-10',
    };
    f.db.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM leases l') ? [candidate()] : ([{ request }] as never),
    );
    await f.service.process({ billingDate });
    expect(f.invoices.generateForLease).toHaveBeenCalledWith(
      leaseId,
      expect.objectContaining(request),
      companyId,
      { billingDate },
    );
  });

  it('adds exact cents by currency and orders separate totals without conversion', async () => {
    const f = setup([
      candidate(leaseId),
      candidate(afterLeaseId),
      candidate('10000000-0000-4000-8000-000000000004'),
    ]);
    f.invoices.generateForLease
      .mockResolvedValueOnce({ currencyCode: 'USD', total: '1.2' })
      .mockResolvedValueOnce({ currencyCode: 'ARS', total: '100' })
      .mockResolvedValueOnce({ currencyCode: 'USD', total: '0.09' });
    await expect(f.service.process({ billingDate })).resolves.toMatchObject({
      totals: [
        { currencyCode: 'ARS', amount: '100.00' },
        { currencyCode: 'USD', amount: '1.29' },
      ],
    });
  });

  it('reports a bad custom calendar without stopping unrelated leases', async () => {
    const invalid = { ...candidate(), billingFrequency: 'custom' };
    const f = setup([invalid, candidate(afterLeaseId)]);
    await expect(f.service.process({ billingDate })).resolves.toMatchObject({
      invoicesProcessed: 1,
      invoicesFailed: 1,
      errors: [{ leaseId, error: 'Custom billing requires a billing day' }],
    });
    expect(f.invoices.generateForLease).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit custom day and reports non-Error failures safely', async () => {
    const custom = {
      ...candidate(),
      billingFrequency: 'custom',
      billingDay: 1,
    };
    const f = setup([custom, candidate(afterLeaseId)]);
    f.invoices.generateForLease
      .mockRejectedValueOnce('private transport data')
      .mockResolvedValueOnce({ currencyCode: 'ARS', total: '0.01' });
    await expect(f.service.process({ billingDate })).resolves.toMatchObject({
      invoicesProcessed: 1,
      invoicesFailed: 1,
      errors: [{ leaseId, error: 'Billing failed' }],
      totals: [{ currencyCode: 'ARS', amount: '0.01' }],
    });
  });

  it('returns an empty result when no eligible leases exist', async () => {
    const f = setup([]);
    await expect(f.service.process({ billingDate })).resolves.toEqual({
      processedLeases: 0,
      invoicesProcessed: 0,
      invoicesFailed: 0,
      invoicesSkipped: 0,
      errors: [],
      totals: [],
      nextCursor: null,
    });
  });
});
