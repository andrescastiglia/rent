import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProviderRequestError } from '../integrations/provider-http.service';
import { PortalPublicationController } from './portal-publication.controller';
import {
  PortalPublicationOutboxService,
  PublicationOperation,
} from './portal-publication-outbox.service';

function setup() {
  const item = { title: 'Test', price: 100 };
  const listing = {
    id: 'listing',
    portal: 'mercadolibre',
    external_id: null as string | null,
    provider_status: null as string | null,
    listing_data: { item, description: 'Text' },
  };
  const job = {
    id: 'job',
    company_id: 'company',
    listing_id: 'listing',
    operation: 'publish' as PublicationOperation,
    payload: { item, description: 'Text' },
    status: 'queued',
    claim_token: 'claim',
    attempts: 1,
  };
  const jobs = [job];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT l.*')) return [listing];
    if (sql.includes('INSERT INTO portal_publication')) return [{ id: 'job' }];
    if (sql.includes('WITH next AS')) return jobs.splice(0, 1);
    if (sql.includes('WITH intent AS')) return [{ id: 'job' }];
    if (sql.includes('SELECT id FROM portal_publication'))
      return [{ id: 'job' }];
    if (sql.includes('AS "deadLetter"')) return [{ deadLetter: 0 }];
    return [];
  });
  const db = {
    query,
    manager: { query },
    transaction: jest.fn(async (work) => work({ query })),
  };
  const remote = {
    id: 'MLA123',
    permalink: 'https://mercadolibre.com.ar/MLA123',
    status: 'active',
  };
  const client = {
    validateListing: jest.fn((value) => {
      if (!value) throw new BadRequestException();
      return value;
    }),
    create: jest.fn().mockResolvedValue(remote),
    get: jest.fn().mockResolvedValue(remote),
    update: jest.fn().mockResolvedValue(remote),
    setStatus: jest.fn().mockResolvedValue(remote),
    upsertDescription: jest.fn(),
  };
  const config = {
    assertEnabled: jest.fn(),
    enabled: jest.fn().mockReturnValue(true),
  };
  const service = new PortalPublicationOutboxService(
    db as never,
    client as never,
    config as never,
  );
  return {
    service,
    db,
    query,
    client,
    config,
    job,
    jobs,
    listing,
    item,
    remote,
  };
}

describe('Portal publication outbox', () => {
  it('does not access the queue or provider while disabled', async () => {
    const f = setup();
    f.config.enabled.mockReturnValue(false);
    f.config.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    expect(() => f.service.assertEnabled()).toThrow('disabled');
    await expect(
      f.service.enqueue('listing', 'company', 'publish'),
    ).rejects.toThrow('disabled');
    await expect(f.service.processDue()).resolves.toMatchObject({
      disabled: true,
      processed: 0,
    });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.client.create).not.toHaveBeenCalled();
  });
  it('atomically validates and queues a snapshot and preserves the listing before publication', async () => {
    const f = setup();
    await expect(
      f.service.enqueue('listing', 'company', 'publish'),
    ).resolves.toEqual({ id: 'job' });
    expect(f.db.transaction).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE OF l'),
      ['listing', 'company'],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO portal_publication'),
      ['company', 'listing', 'publish', JSON.stringify(f.listing.listing_data)],
    );
    expect(f.client.create).not.toHaveBeenCalled();
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('UPDATE portal_listings'),
      ),
    ).toBe(false);
  });
  it('uses database JSON equality to reuse concurrent identical requests', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('AS matches')
        ? ([{ id: 'existing', matches: true }] as never)
        : query(sql),
    );
    await expect(
      f.service.enqueue('listing', 'company', 'publish'),
    ).resolves.toEqual({ id: 'existing' });
    f.query.mockImplementation(async (sql) =>
      sql.includes('AS matches')
        ? ([{ id: 'existing', matches: false }] as never)
        : query(sql),
    );
    await expect(
      f.service.enqueue('listing', 'company', 'publish'),
    ).rejects.toThrow('pending or requires review');
  });
  it('stores a corrected draft without creating a provider job', async () => {
    const f = setup();
    await expect(
      f.service.enqueue('listing', 'company', 'update', { item: f.item }),
    ).resolves.toEqual({ id: null });
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('UPDATE portal_listings'),
      ),
    ).toBe(true);
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO portal_publication'),
      ),
    ).toBe(false);
  });
  it.each(['scope', 'missing', 'portal', 'external', 'closed', 'description'])(
    'rejects %s before enqueueing',
    async (reason) => {
      const f = setup();
      if (reason === 'missing') f.query.mockResolvedValueOnce([]);
      if (reason === 'portal') f.listing.portal = 'zonaprop';
      if (reason === 'closed') f.listing.provider_status = 'closed';
      if (reason === 'description') f.listing.listing_data.description = '';
      await expect(
        f.service.enqueue(
          'listing',
          reason === 'scope' ? '' : 'company',
          reason === 'external' ? 'pause' : 'publish',
        ),
      ).rejects.toThrow();
      expect(f.client.create).not.toHaveBeenCalled();
    },
  );
  it('queues only fields supported for existing listings and rejects silently ignored changes', async () => {
    const f = setup();
    f.listing.external_id = 'MLA123';
    await f.service.enqueue('listing', 'company', 'update', {
      item: { ...f.item, price: 200 },
    });
    await expect(
      f.service.enqueue('listing', 'company', 'update', {
        item: { ...f.item, currency_id: 'ARS' },
      }),
    ).rejects.toThrow('Only title');
  });
  it('returns local queue metadata with company scoping even while disabled', async () => {
    const f = setup();
    f.config.enabled.mockReturnValue(false);
    await expect(f.service.latest('listing', 'company')).resolves.toEqual({
      enabled: false,
      job: null,
    });
    await expect(f.service.latest('listing', '')).rejects.toThrow(
      'Company scope',
    );
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('SELECT id, operation, status')
        ? [{ id: 'job' }]
        : query(sql),
    );
    await expect(f.service.latest('listing', 'company')).resolves.toMatchObject(
      { job: { id: 'job' } },
    );
  });
  it('persists the creation intent, external ID and description before completing', async () => {
    const f = setup();
    await expect(f.service.processDue()).resolves.toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
    });
    expect(f.client.create).toHaveBeenCalledTimes(1);
    const intent = f.query.mock.calls.findIndex(([sql]) =>
      sql.includes('WITH intent'),
    );
    expect(f.query.mock.invocationCallOrder[intent]).toBeLessThan(
      f.client.create.mock.invocationCallOrder[0],
    );
    expect(f.client.upsertDescription).toHaveBeenCalledWith(
      'company',
      'MLA123',
      'Text',
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE portal_listings'),
      [
        'listing',
        'company',
        'MLA123',
        f.remote.permalink,
        'active',
        'published',
        null,
      ],
    );
  });
  it.each([
    'publish',
    'update',
    'pause',
    'remove',
    'refresh',
  ] as PublicationOperation[])(
    'addresses an existing external ID for %s',
    async (operation) => {
      const f = setup();
      f.listing.external_id = 'MLA123';
      f.job.operation = operation;
      f.job.payload.description = '';
      await f.service.processDue();
      expect(f.client.create).not.toHaveBeenCalled();
      expect(f.client.upsertDescription).not.toHaveBeenCalled();
      if (operation === 'update')
        expect(f.client.update).toHaveBeenCalledWith(
          'company',
          'MLA123',
          f.item,
        );
      else if (operation === 'refresh')
        expect(f.client.get).toHaveBeenCalledWith('company', 'MLA123');
      else
        expect(f.client.setStatus).toHaveBeenCalledWith(
          'company',
          'MLA123',
          operation === 'pause'
            ? 'paused'
            : operation === 'remove'
              ? 'closed'
              : 'active',
        );
    },
  );
  it.each([
    ['paused', 'paused'],
    ['closed', 'removed'],
    ['under_review', 'error'],
  ])('persists actual remote status %s as %s', async (state, local) => {
    const f = setup();
    f.remote.status = state;
    await f.service.processDue();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE portal_listings'),
      expect.arrayContaining([state, local]),
    );
  });
  it.each([true, false])(
    'does not repeat a creation when its outcome is uncertain: %s',
    async (unknown) => {
      const f = setup();
      f.client.create.mockRejectedValue(
        new ProviderRequestError('MERCADOLIBRE', unknown, unknown ? 500 : 400),
      );
      await f.service.processDue();
      expect(f.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $3, error_code = $4'),
        [
          'job',
          'claim',
          unknown ? 'needs_review' : 'failed',
          unknown ? 'create_outcome_unknown' : 'provider_rejected',
        ],
      );
    },
  );
  it('keeps a refused credential preflight distinct from an uncertain publication', async () => {
    const f = setup();
    f.client.create.mockRejectedValue(
      new ServiceUnavailableException('Account requires reconnection'),
    );
    await f.service.processDue();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $3, error_code = $4'),
      ['job', 'claim', 'failed', 'provider_rejected'],
    );
  });
  it('requires review for a recovered creation intent instead of posting again', async () => {
    const f = setup();
    f.job.status = 'dispatching';
    await f.service.processDue();
    expect(f.client.create).not.toHaveBeenCalled();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $3, error_code = $4'),
      ['job', 'claim', 'needs_review', 'create_outcome_unknown'],
    );
  });
  it.each(['intent', 'save'])(
    'fences a replaced claim before %s',
    async (stage) => {
      const f = setup();
      const query = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (sql) =>
        sql.includes(
          stage === 'intent'
            ? 'WITH intent'
            : 'SELECT id FROM portal_publication',
        )
          ? []
          : query(sql),
      );
      await expect(f.service.processDue()).resolves.toMatchObject({
        completed: 0,
      });
      expect(f.client.upsertDescription).not.toHaveBeenCalled();
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.includes('UPDATE portal_listings'),
        ),
      ).toBe(false);
    },
  );
  it('does not recreate when saving the returned ID fails', async () => {
    const f = setup();
    f.db.transaction.mockRejectedValue(
      new Error('database unavailable') as never,
    );
    await f.service.processDue();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $3, error_code = $4'),
      ['job', 'claim', 'needs_review', 'create_outcome_unknown'],
    );
  });
  it.each([1, 5])(
    'retries failed updates within the attempt limit (%s)',
    async (attempts) => {
      const f = setup();
      f.listing.external_id = 'MLA123';
      f.job.operation = 'refresh';
      f.job.attempts = attempts;
      f.client.get.mockRejectedValue(new Error('offline'));
      await f.service.processDue();
      if (attempts === 1)
        expect(f.query).toHaveBeenCalledWith(
          expect.stringContaining("interval '60 seconds'"),
          ['job', 'claim'],
        );
      else
        expect(f.query).toHaveBeenCalledWith(
          expect.stringContaining('SET status = $3, error_code = $4'),
          ['job', 'claim', 'needs_review', 'provider_unavailable'],
        );
    },
  );
  it.each(['missing', 'portal', 'external'])(
    'fails an unavailable listing (%s)',
    async (reason) => {
      const f = setup();
      if (reason === 'portal') f.listing.portal = 'zonaprop';
      if (reason === 'external') f.job.operation = 'refresh';
      if (reason === 'missing') {
        const query = f.query.getMockImplementation()!;
        f.query.mockImplementation(async (sql) => {
          if (sql.includes('SELECT l.*')) throw new NotFoundException();
          return query(sql);
        });
      }
      await f.service.processDue();
      expect(f.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $3, error_code = $4'),
        ['job', 'claim', 'failed', 'listing_unavailable'],
      );
    },
  );
  it('enforces batch credentials and passes authenticated scope in the controller', async () => {
    const f = setup();
    const communications = { assertBatchToken: jest.fn() };
    const controller = new PortalPublicationController(
      f.service,
      communications as never,
    );
    await controller.latest('listing', { user: { companyId: 'company' } });
    f.config.enabled.mockReturnValue(false);
    await controller.process('internal-token');
    expect(communications.assertBatchToken).toHaveBeenCalledWith(
      'internal-token',
    );
    communications.assertBatchToken.mockImplementation(() => {
      throw new Error('unauthorized');
    });
    expect(() => controller.process()).toThrow('unauthorized');
  });
});
