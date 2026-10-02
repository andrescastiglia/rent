import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SettlementGenerationService,
  SettlementSourceChangedError,
} from './settlement-generation.service';

describe('Settlement generation consistency and recovery', () => {
  const company = 'company';
  const actor = 'actor';
  const dto = {
    ownerId: 'owner',
    period: '2026-10',
    currency: 'ARS',
    expectedFingerprint: 'reviewed',
    additionalWithholdings: '5.00',
    withholdingReason: 'Retención documentada',
    idempotencyKey: 'request',
    confirmed: true,
  };
  const calculation = {
    ownerId: 'owner',
    period: '2026-10',
    currency: 'ARS',
    commissionRate: '10.00',
    grossAmount: '100.00',
    commissionAmount: '10.00',
    netBeforeWithholdings: '90.00',
    scheduledDate: '2026-10-10',
    existingSettlementIds: [],
    fingerprint: 'reviewed',
    invoices: [{ id: 'invoice', grossAmount: '100.00' }],
  };
  const snapshot = {
    calculation,
    additionalWithholdings: '5.00',
    withholdingReason: dto.withholdingReason,
    netAmount: '85.00',
  };
  const generation = {
    id: 'generation',
    settlementId: 'settlement',
    state: 'active',
    snapshot,
  };
  let query: jest.Mock;
  let transaction: jest.Mock;
  let calculate: jest.Mock;
  let enabled: jest.Mock;
  let assertEnabled: jest.Mock;
  let service: SettlementGenerationService;

  beforeEach(() => {
    query = jest.fn(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('FROM owners')) return [{ id: 'owner' }];
      if (sql.includes('FROM settlement_generations g JOIN owners'))
        return [generation];
      return [];
    });
    transaction = jest.fn(async (execute) => execute({ query }));
    calculate = jest.fn().mockResolvedValue(calculation);
    enabled = jest.fn().mockReturnValue(true);
    assertEnabled = jest.fn();
    service = new SettlementGenerationService(
      { query, manager: { query }, transaction } as never,
      { calculate } as never,
      { enabled, assertEnabled } as never,
    );
  });

  const writes = () =>
    query.mock.calls.filter(([sql]) => /^(INSERT|UPDATE)/.test(sql));

  it('blocks disabled integrations and requires confirmation before opening a transaction', async () => {
    assertEnabled.mockImplementationOnce(() => {
      throw new ServiceUnavailableException('disabled');
    });
    await expect(service.generate(company, actor, dto)).rejects.toThrow(
      'disabled',
    );
    await expect(
      service.generate(company, actor, { ...dto, confirmed: false }),
    ).rejects.toThrow('confirmation');
    await expect(
      service.void(company, actor, 'settlement', {
        confirmed: false,
        reason: 'test',
      }),
    ).rejects.toThrow('confirmation');
    await expect(
      service.cancelRequest(company, actor, {
        ownerId: 'owner',
        requestKey: 'request',
        confirmed: false,
      }),
    ).rejects.toThrow('confirmation');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('locks collections before invoices, rechecks the review, and reserves sources atomically', async () => {
    await expect(service.generate(company, actor, dto)).resolves.toEqual(
      generation,
    );
    expect(calculate).toHaveBeenCalledTimes(2);
    const locked = query.mock.calls
      .filter(([sql]) => sql.includes('FOR UPDATE'))
      .map(([sql]) => sql);
    expect(locked).toEqual([
      expect.stringContaining('FROM payments p'),
      expect.stringContaining('FROM invoices'),
      expect.stringContaining('FROM payment_allocations'),
      expect.stringContaining('FROM credit_notes'),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settlements'),
      [
        expect.any(String),
        'owner',
        '2026-10',
        '100.00',
        '10.00',
        '5.00',
        '85.00',
        'ARS',
        '2026-10-10',
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settlement_generations'),
      [
        expect.any(String),
        company,
        expect.any(String),
        'owner',
        actor,
        'request',
        JSON.stringify(dto),
        JSON.stringify(snapshot),
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settlement_generation_sources'),
      [
        company,
        expect.any(String),
        'invoice',
        JSON.stringify(calculation.invoices[0]),
      ],
    );
  });

  it('recovers a committed request without recalculating or reserving its sources again', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM owners')) return [{ id: 'owner' }];
      if (sql.includes('SELECT settlement_id,request'))
        return [{ settlement_id: 'settlement', request: dto }];
      if (sql.includes('FROM settlement_generations g JOIN owners'))
        return [generation];
      return [];
    });
    await expect(
      service.generate(company, actor, {
        ...dto,
        withholdingReason: dto.withholdingReason,
      }),
    ).resolves.toEqual(generation);
    expect(calculate).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    await expect(
      service.generate(company, actor, {
        ...dto,
        additionalWithholdings: '6.00',
      }),
    ).rejects.toThrow('different input');
  });

  it.each([
    [
      'changed review',
      { ...calculation, fingerprint: 'changed' },
      'fresh preview',
    ],
    ['empty sources', { ...calculation, invoices: [] }, 'No unreserved'],
    [
      'exhausted net',
      { ...calculation, netBeforeWithholdings: '5.00' },
      'supported bounds',
    ],
    [
      'negative net',
      { ...calculation, netBeforeWithholdings: '4.00' },
      'supported bounds',
    ],
    [
      'oversized net',
      { ...calculation, netBeforeWithholdings: '10000000000005.00' },
      'supported bounds',
    ],
    [
      'oversized gross',
      { ...calculation, grossAmount: '10000000000000.00' },
      'supported bounds',
    ],
  ])(
    'rejects %s without persisting a settlement',
    async (_reason, current, message) => {
      calculate.mockResolvedValue(current);
      await expect(service.generate(company, actor, dto)).rejects.toThrow(
        message as string,
      );
      expect(writes()).toHaveLength(0);
    },
  );

  it('rejects a source changed between preview and row locking', async () => {
    calculate.mockResolvedValueOnce(calculation).mockResolvedValueOnce({
      ...calculation,
      fingerprint: 'concurrent-change',
    });
    await expect(service.generate(company, actor, dto)).rejects.toThrow(
      'while confirming',
    );
    expect(writes()).toHaveLength(0);
  });

  it.each([
    ['FROM owners', 'Owner not found'],
    ['FROM settlement_generation_cancellations', 'cancelled'],
    ["s.status<>'cancelled'", 'Historical settlement'],
  ])('rejects invalid generation state %s', async (match, message) => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes(match))
        return match === 'FROM owners' ? [] : [{ id: 'found' }];
      return sql.includes('FROM owners') ? [{ id: 'owner' }] : [];
    });
    await expect(service.generate(company, actor, dto)).rejects.toThrow(
      message,
    );
    expect(writes()).toHaveLength(0);
  });

  it('translates a unique reservation collision but preserves unexpected database errors', async () => {
    transaction.mockRejectedValueOnce({ code: '23505' });
    await expect(service.generate(company, actor, dto)).rejects.toThrow(
      'already reserved',
    );
    const failure = new Error('Database unavailable');
    transaction.mockRejectedValueOnce(failure);
    await expect(service.generate(company, actor, dto)).rejects.toBe(failure);
  });

  it('makes a company-scoped tombstone for an uncommitted request', async () => {
    jest.spyOn(service, 'overview').mockResolvedValue({
      enabled: true,
      canVoid: false,
      requestCancelled: true,
      generation: null,
    });
    await expect(
      service.cancelRequest(company, actor, {
        ownerId: 'owner',
        requestKey: 'request',
        confirmed: true,
      }),
    ).resolves.toMatchObject({ requestCancelled: true });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO settlement_generation_cancellations',
      ),
      [company, 'request', 'owner', actor],
    );
  });

  it.each(['owner', 'another-owner'])(
    'does not cancel a committed generation for %s',
    async (owner) => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT owner_id FROM settlement_generations'))
          return [{ owner_id: owner }];
        return sql.includes('FROM owners') ? [{ id: 'owner' }] : [];
      });
      jest.spyOn(service, 'overview').mockResolvedValue({
        enabled: true,
        canVoid: false,
        requestCancelled: false,
        generation: null,
      });
      const result = service.cancelRequest(company, actor, {
        ownerId: 'owner',
        requestKey: 'request',
        confirmed: true,
      });
      if (owner === 'owner')
        await expect(result).resolves.toMatchObject({
          requestCancelled: false,
        });
      else await expect(result).rejects.toThrow('another owner');
      expect(writes()).toHaveLength(0);
    },
  );

  it('keeps historical generations readable when disabled and reports safe void eligibility', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM owners')) return [{ id: 'owner' }];
      if (sql.includes('FROM settlement_generations g JOIN owners'))
        return [generation];
      if (sql.includes('SELECT settlement_id FROM settlement_generations'))
        return [{ settlement_id: 'settlement' }];
      if (sql.includes('AS "canVoid"')) return [{ canVoid: true }];
      return [];
    });
    const request = { ownerId: 'owner', requestKey: 'request' };
    await expect(service.overview(company, request)).resolves.toMatchObject({
      enabled: true,
      canVoid: true,
      generation,
    });
    enabled.mockReturnValue(false);
    await expect(service.overview(company, request)).resolves.toMatchObject({
      enabled: false,
      canVoid: false,
      generation,
    });
    expect(assertEnabled).not.toHaveBeenCalled();
  });

  it('reports absent requests, including cancellation and no selection', async () => {
    await expect(
      service.overview(company, { ownerId: 'owner' }),
    ).resolves.toMatchObject({ generation: null, requestCancelled: false });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM owners')) return [{ id: 'owner' }];
      if (sql.includes('FROM settlement_generation_cancellations')) return [{}];
      return [];
    });
    await expect(
      service.overview(company, { ownerId: 'owner', requestKey: 'request' }),
    ).resolves.toMatchObject({ generation: null, requestCancelled: true });
  });

  it('rejects ambiguous requests and missing company resources', async () => {
    await expect(
      service.overview(company, {
        ownerId: 'owner',
        requestKey: 'request',
        settlementId: 'settlement',
      }),
    ).rejects.toThrow('Choose');
    await expect(
      service.overview(company, { ownerId: 'owner', settlementId: 'foreign' }),
    ).rejects.toThrow('Settlement not found');
    query.mockResolvedValue([]);
    await expect(
      service.overview(company, { ownerId: 'foreign' }),
    ).rejects.toThrow('Owner not found');
    await expect(service.get('foreign', company)).rejects.toThrow(
      'generation not found',
    );
    await expect(
      service.cancelRequest(company, actor, {
        ownerId: 'foreign',
        requestKey: 'request',
        confirmed: true,
      }),
    ).rejects.toThrow('Owner not found');
  });

  function sourceState(state = 'active', stored = snapshot) {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id,state,snapshot'))
        return [{ state, snapshot: stored }];
      if (sql.includes('SELECT owner_id,period,currency'))
        return [
          {
            owner_id: 'owner',
            period: '2026-10',
            currency: 'ARS',
            gross_amount: '100.00',
            commission_amount: '10.00',
            withholdings_amount: '5.00',
            net_amount: '85.00',
          },
        ];
      return [];
    });
  }

  it('revalidates financial values and historical sources before transfer', async () => {
    sourceState();
    await service.assertSources({ query } as never, 'settlement', company);
    expect(calculate).toHaveBeenCalledWith(
      { query },
      company,
      calculation,
      ['invoice'],
      '10.00',
    );
    sourceState('voided');
    await expect(
      service.assertSources({ query } as never, 'settlement', company),
    ).rejects.toBeInstanceOf(SettlementSourceChangedError);
  });

  it('rejects changed settlement values or allocations', async () => {
    sourceState('active', { ...snapshot, netAmount: '84.00' });
    await expect(
      service.assertSources({ query } as never, 'settlement', company),
    ).rejects.toBeInstanceOf(SettlementSourceChangedError);
    sourceState();
    calculate.mockResolvedValue({
      ...calculation,
      invoices: [{ id: 'changed' }],
    });
    await expect(
      service.assertSources({ query } as never, 'settlement', company),
    ).rejects.toBeInstanceOf(SettlementSourceChangedError);
  });

  it.each([
    new ConflictException(),
    new NotFoundException(),
    new Error('storage offline'),
  ])('classifies source validation error %s', async (error) => {
    sourceState();
    calculate.mockRejectedValue(error);
    const result = service.assertSources(
      { query } as never,
      'settlement',
      company,
    );
    if (
      error instanceof ConflictException ||
      error instanceof NotFoundException
    )
      await expect(result).rejects.toBeInstanceOf(SettlementSourceChangedError);
    else await expect(result).rejects.toBe(error);
  });

  it('retains the historical administrative flow without inventing source records', async () => {
    query.mockResolvedValue([]);
    await expect(
      service.assertSources({ query } as never, 'legacy', company),
    ).resolves.toBeUndefined();
    expect(calculate).not.toHaveBeenCalled();
  });

  function voidState(
    job: Record<string, unknown> | null = null,
    extras: {
      reference?: string;
      movement?: boolean;
      newJob?: boolean;
      state?: string;
    } = {},
  ) {
    let viewed = false;
    query.mockImplementation(async (sql: string) => {
      if (
        sql.includes('FROM settlement_payout_outbox') &&
        sql.includes('FOR UPDATE')
      )
        return job ? [job] : [];
      if (sql.includes('SELECT s.id,s.transfer_reference'))
        return [
          { id: 'settlement', transfer_reference: extras.reference ?? null },
        ];
      if (sql.includes('FROM settlement_generations g JOIN owners')) {
        const result = {
          ...generation,
          state: viewed ? 'voided' : (extras.state ?? 'active'),
        };
        viewed = true;
        return [result];
      }
      if (sql.includes('SELECT id FROM settlement_payout_outbox'))
        return extras.newJob ? [{ id: 'new-job' }] : [];
      if (sql.includes('FROM settlement_payout_movements'))
        return extras.movement ? [{ id: 'movement' }] : [];
      return [];
    });
  }

  it.each([
    null,
    { id: 'job', status: 'queued', payout_id: null },
    {
      id: 'job',
      status: 'failed',
      payout_id: null,
      error_code: 'provider_rejected',
    },
  ])(
    'voids only an unsubmitted generation and releases its reserved invoices',
    async (job) => {
      voidState(job);
      await expect(
        service.void(company, actor, 'settlement', {
          confirmed: true,
          reason: 'Corrección revisada',
        }),
      ).resolves.toMatchObject({ state: 'voided' });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("state='voided'"),
        ['generation', actor, 'Corrección revisada'],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('released_at=now()'),
        ['generation'],
      );
      if (job)
        expect(query).toHaveBeenCalledWith(
          expect.stringContaining("error_code='generation_voided'"),
          ['job'],
        );
    },
  );

  it.each([
    [{ id: 'job', status: 'submitted', payout_id: 'remote' }, {}],
    [
      { id: 'job', status: 'failed', payout_id: null, error_code: 'uncertain' },
      {},
    ],
    [null, { reference: 'remote' }],
    [null, { movement: true }],
    [null, { newJob: true }],
  ] as const)(
    'never voids uncertain or recorded financial effects %#',
    async (job, extras) => {
      voidState(job, extras);
      await expect(
        service.void(company, actor, 'settlement', {
          confirmed: true,
          reason: 'test',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(writes()).toHaveLength(0);
    },
  );

  it('recovers an existing void and hides missing settlements', async () => {
    voidState(null, { state: 'voided' });
    await expect(
      service.void(company, actor, 'settlement', {
        confirmed: true,
        reason: 'test',
      }),
    ).resolves.toMatchObject({ state: 'voided' });
    expect(writes()).toHaveLength(0);
    query.mockResolvedValue([]);
    await expect(
      service.void(company, actor, 'foreign', {
        confirmed: true,
        reason: 'test',
      }),
    ).rejects.toThrow('Settlement not found');
  });
});
