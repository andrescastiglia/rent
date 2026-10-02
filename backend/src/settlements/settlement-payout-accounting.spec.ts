import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProviderRequestError } from '../integrations/provider-http.service';
import { SettlementSourceChangedError } from './settlement-generation.service';
import { SettlementPayoutsService } from './settlement-payouts.service';

describe('Payout worker accounting and uncertain outcomes', () => {
  const baseJob = {
    id: 'job',
    company_id: 'company',
    settlement_id: 'settlement',
    owner_id: 'owner',
    request: { amount: '90.00', currency: 'ARS' },
    status: 'awaiting',
    payout_id: 'POP1',
    transaction_id: 'TOP1',
    claim_token: 'claim',
    failures: 0,
    remote_updated_at: null as string | null,
    remote_status: null as string | null,
    remote_detail: null as string | null,
  };
  const baseRemote = {
    status: 'success',
    status_detail: 'accredited',
    last_update_date: '2026-10-02T12:00:00Z',
  };

  function setup(
    options: {
      job?: Partial<typeof baseJob>;
      remote?: Partial<typeof baseRemote>;
      settlement?: Record<string, unknown>;
      ledger?: { transfers: number; reversals: number };
      lostClaimAt?: number;
      duplicateMovement?: boolean;
    } = {},
  ) {
    const job = { ...baseJob, ...options.job };
    const remote = { ...baseRemote, ...options.remote };
    const settlement = {
      id: 'settlement',
      owner_id: 'owner',
      net_amount: '90.00',
      currency: 'ARS',
      status: 'processing',
      ...options.settlement,
    };
    const ledger = options.ledger ?? { transfers: 0, reversals: 0 };
    let fetched = false;
    let claims = 0;
    const query = jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('claim_token=$2')) {
        claims++;
        return claims === options.lostClaimAt ? [] : [{ ...job }];
      }
      if (sql.includes('SELECT s.*')) return [settlement];
      if (sql.includes('FILTER (WHERE kind=')) return [ledger];
      if (sql.includes('INSERT INTO settlement_payout_movements'))
        return options.duplicateMovement ? [] : [{ id: 'movement' }];
      if (sql.includes('INSERT INTO settlement_payout_effects_outbox'))
        return [{ id: 'event' }];
      if (sql.includes("SET status='dispatching'")) job.status = 'dispatching';
      if (sql.includes('SET payout_id=$2')) {
        job.payout_id = values![1] as string;
        job.transaction_id = values![2] as string;
        job.status = 'awaiting';
      }
      if (sql.includes('SET status=$2,error_code=$3'))
        job.status = values![1] as string;
      return [];
    });
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.startsWith('WITH next')) {
          if (fetched) return [];
          fetched = true;
          return [{ ...job }];
        }
        return [{ status: job.status }];
      }),
      transaction: jest.fn(async (execute) => execute({ query })),
    };
    const client = {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'POP1', transactions: [{ id: 'TOP1' }] }),
      validate: jest.fn(),
      transaction: jest.fn().mockResolvedValue(remote),
      isAccredited: jest.fn(
        (value) =>
          value.status === 'success' && value.status_detail === 'accredited',
      ),
    };
    const sources = { assertSources: jest.fn() };
    const service = new SettlementPayoutsService(
      db as never,
      client as never,
      { enabled: () => true, assertEnabled: jest.fn() } as never,
      sources as never,
    );
    return { service, db, query, client, sources, job };
  }

  const finished = (query: jest.Mock) =>
    query.mock.calls.find(([sql]) =>
      sql.includes('SET status=$2,error_code=$3'),
    )?.[1];
  const movements = (query: jest.Mock) =>
    query.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO settlement_payout_movements'),
    );

  it('persists dispatch intent before provider creation, then records accreditation and its receipt', async () => {
    const f = setup({
      job: {
        status: 'queued',
        payout_id: null as never,
        transaction_id: null as never,
      },
    });
    f.client.create.mockImplementation(async () => {
      expect(f.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status='dispatching'"),
        ['job'],
      );
      return { id: 'POP1', transactions: [{ id: 'TOP1' }] };
    });
    await expect(f.service.processDue()).resolves.toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
      deadLetter: 0,
    });
    expect(f.client.create).toHaveBeenCalledTimes(1);
    expect(f.sources.assertSources).toHaveBeenCalledTimes(1);
    expect(movements(f.query)[0][1]).toEqual([
      'company',
      'settlement',
      'job',
      'transfer',
      '90.00',
      'ARS',
      'TOP1',
      '2026-10-02T12:00:00.000Z',
    ]);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settlement_payout_effects_outbox'),
      ['movement'],
    );
    expect(finished(f.query)).toEqual(['job', 'completed', null, true]);
  });

  it('replays accreditation without sending a new transfer or duplicating ledger entries', async () => {
    const f = setup({
      job: { status: 'completed' },
      ledger: { transfers: 1, reversals: 0 },
      settlement: { status: 'completed' },
    });
    await expect(f.service.processDue()).resolves.toMatchObject({
      completed: 0,
      failed: 0,
    });
    expect(f.client.create).not.toHaveBeenCalled();
    expect(movements(f.query)).toHaveLength(0);
    expect(finished(f.query)).toEqual(['job', 'completed', null, true]);
  });

  it.each([
    [{ transfers: 0, reversals: 1 }, {}, 'accreditation_after_reversal'],
    [
      { transfers: 0, reversals: 0 },
      { status: 'failed' },
      'unexpected_settlement_status',
    ],
  ])(
    'does not credit a reversed or ineligible settlement %#',
    async (ledger, settlement, code) => {
      const f = setup({ ledger, settlement });
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 0,
        deadLetter: 1,
      });
      expect(finished(f.query)).toEqual(['job', 'needs_review', code, true]);
      expect(movements(f.query)).toHaveLength(0);
    },
  );

  it('does not reaccredit a previously refunded transfer even without a reversal row', async () => {
    const f = setup({
      job: { remote_status: 'refunded', remote_detail: 'refunded' },
    });
    await f.service.processDue();
    expect(finished(f.query)).toEqual([
      'job',
      'needs_review',
      'accreditation_after_reversal',
      true,
    ]);
  });

  it.each([
    { transfers: 1, reversals: 0 },
    { transfers: 1, reversals: 1 },
    { transfers: 0, reversals: 0 },
  ])(
    'reconciles a complete refund without duplicating reversals %#',
    async (ledger) => {
      const f = setup({
        remote: { status: 'refunded', status_detail: 'refunded' },
        ledger,
      });
      await f.service.processDue();
      expect(finished(f.query)).toEqual(['job', 'reversed', null, true]);
      expect(movements(f.query)).toHaveLength(
        ledger.transfers && !ledger.reversals ? 1 : 0,
      );
      if (ledger.transfers && !ledger.reversals) {
        expect(movements(f.query)[0][1][3]).toBe('reversal');
        expect(f.query).toHaveBeenCalledWith(
          expect.stringContaining("SET status='blocked'"),
          ['company', 'settlement', 'Settlement transfer reversed'],
        );
      }
    },
  );

  it.each([
    [
      'refunded',
      'partially_refunded',
      { transfers: 1, reversals: 0 },
      'needs_review',
      'partial_refund_requires_review',
    ],
    [
      'pending',
      '',
      { transfers: 1, reversals: 0 },
      'needs_review',
      'status_changed_after_accreditation',
    ],
    [
      'pending',
      '',
      { transfers: 0, reversals: 1 },
      'needs_review',
      'status_changed_after_accreditation',
    ],
    [
      'rejected',
      '',
      { transfers: 0, reversals: 0 },
      'failed',
      'transfer_not_accredited',
    ],
    [
      'canceled',
      '',
      { transfers: 0, reversals: 0 },
      'failed',
      'transfer_not_accredited',
    ],
    [
      'error',
      '',
      { transfers: 0, reversals: 0 },
      'failed',
      'transfer_not_accredited',
    ],
    [
      'unrecognized',
      '',
      { transfers: 0, reversals: 0 },
      'needs_review',
      'unknown_provider_status',
    ],
    ['created', '', { transfers: 0, reversals: 0 }, 'awaiting', null],
    ['pending', '', { transfers: 0, reversals: 0 }, 'awaiting', null],
    ['approved', '', { transfers: 0, reversals: 0 }, 'awaiting', null],
    ['processed', '', { transfers: 0, reversals: 0 }, 'awaiting', null],
    [
      'transaction_in_process',
      '',
      { transfers: 0, reversals: 0 },
      'awaiting',
      null,
    ],
    [
      'success',
      'in_progress',
      { transfers: 0, reversals: 0 },
      'awaiting',
      null,
    ],
  ])(
    'handles remote %s/%s using canonical accounting',
    async (status, detail, ledger, expected, code) => {
      const f = setup({
        remote: { status: status as string, status_detail: detail as string },
        ledger: ledger as { transfers: number; reversals: number },
      });
      await f.service.processDue();
      expect(finished(f.query)).toEqual(['job', expected, code, true]);
      expect(movements(f.query)).toHaveLength(0);
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );

  it.each(['awaiting', 'completed'])(
    'ignores older remote observations for %s',
    async (status) => {
      const f = setup({
        job: { status, remote_updated_at: '2026-10-03T00:00:00Z' },
      });
      await f.service.processDue();
      expect(finished(f.query)).toEqual(['job', status, null, false]);
      expect(movements(f.query)).toHaveLength(0);
    },
  );

  it('requires review for contradictory statuses at the same provider timestamp', async () => {
    const f = setup({
      job: {
        remote_updated_at: baseRemote.last_update_date,
        remote_status: 'pending',
        remote_detail: null,
      },
    });
    await f.service.processDue();
    expect(finished(f.query)).toEqual([
      'job',
      'needs_review',
      'conflicting_provider_status',
      false,
    ]);
    expect(movements(f.query)).toHaveLength(0);
  });

  it('treats missing provider detail as null and preserves an identical observation', async () => {
    const f = setup({
      job: {
        remote_updated_at: baseRemote.last_update_date,
        remote_status: 'pending',
        remote_detail: null,
      },
      remote: { status: 'pending', status_detail: undefined },
    });
    await f.service.processDue();
    expect(finished(f.query)).toEqual(['job', 'awaiting', null, true]);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET remote_status=$2'),
      ['job', 'pending', null, '2026-10-02T12:00:00.000Z'],
    );
  });

  it.each([1, 2, 3])(
    'stops when the worker loses claim at transaction %s',
    async (lostClaimAt) => {
      const f = setup({
        lostClaimAt,
        job: {
          status: 'queued',
          payout_id: null as never,
          transaction_id: null as never,
        },
      });
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 0,
        failed: 0,
      });
      expect(movements(f.query)).toHaveLength(0);
    },
  );

  it('does not enqueue another document when the movement already exists', async () => {
    const f = setup({ duplicateMovement: true });
    await f.service.processDue();
    expect(f.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settlement_payout_effects_outbox'),
      expect.anything(),
    );
  });

  it.each([
    [new Error('read failed'), 0, 'awaiting', 'provider_read_failed'],
    [new Error('read failed'), 4, 'needs_review', 'reconciliation_required'],
    [
      new ConflictException('changed'),
      0,
      'needs_review',
      'reconciliation_required',
    ],
    [
      new NotFoundException('missing'),
      0,
      'needs_review',
      'reconciliation_required',
    ],
  ])(
    'classifies known-transaction failures without resending %#',
    async (error, failures, status, code) => {
      const f = setup({ job: { failures: failures as number } });
      f.client.transaction.mockRejectedValue(error);
      await expect(f.service.processDue()).resolves.toMatchObject({
        failed: 1,
        deadLetter: status === 'needs_review' ? 1 : 0,
      });
      expect(finished(f.query)).toEqual(['job', status, code, false]);
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new Error('connection lost'), 'needs_review', 'create_outcome_unknown'],
    [
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', true, 500),
      'needs_review',
      'create_outcome_unknown',
    ],
    [
      new ProviderRequestError('MERCADOPAGO_PAYOUTS', false, 422),
      'failed',
      'provider_rejected',
    ],
    [
      new BadRequestException('invalid request'),
      'failed',
      'configuration_error',
    ],
    [
      new ServiceUnavailableException('disabled'),
      'failed',
      'configuration_error',
    ],
  ])(
    'preserves uncertain creation outcomes for manual recovery %#',
    async (error, status, code) => {
      const f = setup({
        job: {
          status: 'queued',
          payout_id: null as never,
          transaction_id: null as never,
        },
      });
      f.client.create.mockRejectedValue(error);
      await f.service.processDue();
      expect(finished(f.query)).toEqual(['job', status, code, false]);
      expect(f.client.create).toHaveBeenCalledTimes(1);
      expect(movements(f.query)).toHaveLength(0);
    },
  );

  it('does not create transfers from changed source documents', async () => {
    const f = setup({
      job: {
        status: 'queued',
        payout_id: null as never,
        transaction_id: null as never,
      },
    });
    f.sources.assertSources.mockRejectedValue(
      new SettlementSourceChangedError(),
    );
    await f.service.processDue();
    expect(finished(f.query)).toEqual([
      'job',
      'failed',
      'source_changed',
      false,
    ]);
    expect(f.client.create).not.toHaveBeenCalled();
  });

  it.each([
    { owner_id: 'other' },
    { net_amount: '91.00' },
    { currency: 'USD' },
  ])(
    'requires review when the settlement no longer matches the payout %#',
    async (settlement) => {
      const f = setup({ settlement });
      await f.service.processDue();
      expect(finished(f.query)).toEqual([
        'job',
        'needs_review',
        'reconciliation_required',
        false,
      ]);
      expect(f.client.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['dispatching', 'processing', 'needs_review', 'create_outcome_unknown'],
    ['queued', 'failed', 'failed', 'configuration_error'],
  ])(
    'never blindly resends %s for a %s settlement',
    async (status, settlementStatus, expected, code) => {
      const f = setup({
        job: {
          status,
          payout_id: null as never,
          transaction_id: null as never,
        },
        settlement: { status: settlementStatus },
      });
      await f.service.processDue();
      expect(finished(f.query)).toEqual(['job', expected, code, false]);
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );

  it('does not record accreditation from an invalid timestamp', async () => {
    const f = setup({ remote: { last_update_date: 'invalid' } });
    await f.service.processDue();
    expect(finished(f.query)).toEqual([
      'job',
      'awaiting',
      'provider_read_failed',
      false,
    ]);
    expect(movements(f.query)).toHaveLength(0);
  });

  it('does not overwrite another worker after losing its claim during failure handling', async () => {
    const f = setup({ lostClaimAt: 2 });
    f.client.transaction.mockRejectedValue(new Error('read failed'));
    await expect(f.service.processDue()).resolves.toMatchObject({
      failed: 1,
      deadLetter: 0,
    });
    expect(finished(f.query)).toBeUndefined();
  });
});
