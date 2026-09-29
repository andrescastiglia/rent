import { BadRequestException, ConflictException } from '@nestjs/common';
import { PortalPublicationReviewService } from './portal-publication-review.service';
import { PortalPublicationReviewController } from './portal-publication-review.controller';

function setup() {
  const job = {
    id: 'job',
    operation: 'publish',
    status: 'needs_review',
    error_code: 'create_outcome_unknown',
    payload: { description: 'Description' },
  };
  const listing = { id: 'listing', external_id: null as string | null };
  const remote = {
    id: 'MLA123',
    seller_id: 42,
    status: 'active',
    permalink: 'https://mercadolibre.com.ar/MLA123',
  };
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM portal_publication_outbox')) return [job];
    if (sql.includes('SELECT l.id')) return [listing];
    if (sql.startsWith('SELECT id FROM portal_publication_outbox'))
      return [{ id: 'job' }];
    if (sql.startsWith('INSERT INTO portal_publication_outbox'))
      return [{ id: 'followup' }];
    if (sql.startsWith('INSERT INTO portal_publication_resolutions'))
      return [{ id: 'resolution' }];
    return [];
  });
  const db = {
    query,
    manager: { query },
    transaction: jest.fn(async (work) => work({ query })),
  };
  const client = { get: jest.fn().mockResolvedValue(remote) };
  const config = { assertEnabled: jest.fn() };
  const service = new PortalPublicationReviewService(
    db as never,
    client as never,
    config as never,
  );
  const resolve = (dto: Record<string, unknown>) =>
    service.resolve('company', 'actor', 'listing', 'job', {
      reason: 'Reviewed provider account',
      ...dto,
    } as never);
  return { service, resolve, job, listing, remote, query, client, config, db };
}

describe('Portal incident review', () => {
  it('rejects disabled requests before database or provider calls', async () => {
    const f = setup();
    f.config.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(f.resolve({ action: 'retry' })).rejects.toThrow('disabled');
    await expect(
      f.service.candidate('company', 'listing', 'job', 'MLA123'),
    ).rejects.toThrow('disabled');
    expect(f.query).not.toHaveBeenCalled();
    expect(f.client.get).not.toHaveBeenCalled();
  });
  it('verifies ownership outside the transaction and links with a read/description followup without publication', async () => {
    const f = setup();
    await expect(
      f.resolve({ action: 'link', externalId: 'MLA123' }),
    ).resolves.toEqual({ id: 'resolution' });
    expect(f.client.get).toHaveBeenCalledWith('company', 'MLA123');
    expect(f.client.get.mock.invocationCallOrder[0]).toBeLessThan(
      f.db.transaction.mock.invocationCallOrder[0],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO portal_publication_outbox'),
      [
        'company',
        'listing',
        'refresh',
        JSON.stringify({ description: 'Description' }),
      ],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO portal_publication_resolutions'),
      [
        'company',
        'listing',
        'job',
        'actor',
        'link',
        'Reviewed provider account',
        'MLA123',
        JSON.stringify(f.remote),
        'followup',
      ],
    );
  });
  it.each(['active', 'paused', 'closed', 'under_review'])(
    'preserves confirmed provider status %s when linking',
    async (status) => {
      const f = setup();
      f.remote.status = status;
      f.job.payload = {} as never;
      await f.resolve({ action: 'link', externalId: 'MLA123' });
      const call = f.query.mock.calls.find(([sql]) =>
        sql.startsWith('UPDATE portal_listings'),
      ) as unknown as [string, unknown[]];
      expect(call[1][5]).toBe(
        status === 'active'
          ? 'published'
          : status === 'paused'
            ? 'paused'
            : status === 'closed'
              ? 'removed'
              : 'error',
      );
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.startsWith('INSERT INTO portal_publication_outbox'),
        ),
      ).toBe(false);
    },
  );
  it('requires explicit absence confirmation and never automatically republishes', async () => {
    const f = setup();
    await expect(f.resolve({ action: 'confirm_not_created' })).rejects.toThrow(
      'Explicit confirmation',
    );
    await f.resolve({
      action: 'confirm_not_created',
      confirmedNoPublication: true,
    });
    expect(f.client.get).not.toHaveBeenCalled();
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO portal_publication_outbox'),
      ),
    ).toBe(false);
  });
  it('refuses retries of ambiguous creations', async () => {
    const f = setup();
    await expect(f.resolve({ action: 'retry' })).rejects.toThrow(
      'uncertain creation',
    );
  });
  it('allows a new job for a definitively rejected creation or an existing external item', async () => {
    const f = setup();
    f.job.status = 'failed';
    f.job.error_code = 'provider_rejected';
    await f.resolve({ action: 'retry' });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO portal_publication_outbox'),
      ['company', 'listing', 'publish', JSON.stringify(f.job.payload)],
    );
    f.listing.external_id = 'MLA123';
    f.job.operation = 'update';
    f.job.status = 'needs_review';
    await f.resolve({ action: 'retry' });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO portal_publication_outbox'),
      ['company', 'listing', 'update', JSON.stringify(f.job.payload)],
    );
  });
  it('accepts current remote state without replaying the rejected mutation', async () => {
    const f = setup();
    f.listing.external_id = 'MLA123';
    f.job.operation = 'pause';
    await f.resolve({ action: 'accept_remote' });
    expect(f.client.get).toHaveBeenCalledWith('company', 'MLA123');
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO portal_publication_outbox'),
      ),
    ).toBe(false);
  });
  it('rejects missing or changed external items when accepting remote state', async () => {
    const f = setup();
    await expect(f.resolve({ action: 'accept_remote' })).rejects.toThrow(
      'No external item',
    );
    f.listing.external_id = 'MLA123';
    f.client.get.mockImplementation(async () => {
      f.listing.external_id = 'MLA456';
      return f.remote;
    });
    await expect(f.resolve({ action: 'accept_remote' })).rejects.toThrow(
      'External item changed',
    );
  });
  it.each(['query', 'constraint', 'other'])(
    'handles external IDs already bound during %s',
    async (mode) => {
      const f = setup();
      const original = f.query.getMockImplementation()!;
      f.query.mockImplementation(async (sql) => {
        if (
          mode === 'query' &&
          sql.startsWith('SELECT id FROM portal_listings')
        )
          return [{ id: 'other' }] as never;
        if (mode !== 'query' && sql.startsWith('UPDATE portal_listings'))
          throw Object.assign(new Error('db'), {
            code: mode === 'constraint' ? '23505' : 'XX000',
          });
        return original(sql);
      });
      await expect(
        f.resolve({ action: 'link', externalId: 'MLA123' }),
      ).rejects.toThrow(
        mode === 'other' ? 'db' : 'External item is already linked',
      );
    },
  );
  it.each(['missing', 'stale', 'resolved', 'other_portal'])(
    'rejects %s operations before provider lookup',
    async (mode) => {
      const f = setup();
      const original = f.query.getMockImplementation()!;
      if (mode === 'resolved') f.job.status = 'resolved';
      f.query.mockImplementation(async (sql) => {
        if (
          mode === 'missing' &&
          sql.startsWith('SELECT * FROM portal_publication_outbox')
        )
          return [];
        if (
          mode === 'stale' &&
          sql.startsWith('SELECT id FROM portal_publication_outbox')
        )
          return [{ id: 'newer' }] as never;
        if (mode === 'other_portal' && sql.includes('SELECT l.id')) return [];
        return original(sql);
      });
      await expect(
        f.resolve({ action: 'link', externalId: 'MLA123' }),
      ).rejects.toThrow();
      expect(f.client.get).not.toHaveBeenCalled();
    },
  );
  it('rechecks a resolved incident after the provider response', async () => {
    const f = setup();
    f.client.get.mockImplementation(async () => {
      f.job.status = 'resolved';
      return f.remote;
    });
    await expect(
      f.resolve({ action: 'link', externalId: 'MLA123' }),
    ).rejects.toThrow(ConflictException);
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE portal_listings'),
      ),
    ).toBe(false);
  });
  it('does not allow linking non-creation jobs, known items, or invalid IDs', async () => {
    const f = setup();
    f.job.operation = 'pause';
    await expect(
      f.resolve({ action: 'link', externalId: 'MLA123' }),
    ).rejects.toThrow('Only unresolved creations');
    f.job.operation = 'publish';
    f.listing.external_id = 'MLA123';
    await expect(
      f.resolve({ action: 'link', externalId: 'MLA123' }),
    ).rejects.toThrow('Only unresolved creations');
    f.listing.external_id = null;
    await expect(
      f.resolve({ action: 'link', externalId: '../other' }),
    ).rejects.toThrow('Invalid Mercado Libre');
    await expect(f.resolve({ action: 'link' })).rejects.toThrow(
      'Invalid Mercado Libre',
    );
  });
  it('rejects invalid resolution metadata and missing company/actor scopes', async () => {
    const f = setup();
    for (const dto of [
      { action: 'invalid' },
      { action: 'retry', reason: 'short' },
      { action: 'retry', reason: 'x'.repeat(1001) },
    ])
      await expect(f.resolve(dto)).rejects.toThrow(BadRequestException);
    await expect(
      f.service.resolve('company', '', 'listing', 'job', {
        action: 'retry',
        reason: 'Reviewed account',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      f.service.resolve('', 'actor', 'listing', 'job', {
        action: 'retry',
        reason: 'Reviewed account',
      }),
    ).rejects.toThrow('Company scope');
    await expect(f.service.history('', 'listing')).rejects.toThrow(
      'Company scope',
    );
  });
  it('keeps scoped resolution history readable while disabled', async () => {
    const f = setup();
    await expect(f.service.history('company', 'listing')).resolves.toEqual([]);
    expect(f.config.assertEnabled).not.toHaveBeenCalled();
    expect(f.client.get).not.toHaveBeenCalled();
  });
  it('propagates provider verification failures without applying a resolution', async () => {
    const f = setup();
    f.client.get.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      f.resolve({ action: 'link', externalId: 'MLA123' }),
    ).rejects.toThrow('provider unavailable');
    expect(f.db.transaction).not.toHaveBeenCalled();
  });
  it('takes actor and company only from the authenticated request', async () => {
    const reviews = {
      candidate: jest.fn(),
      resolve: jest.fn(),
      history: jest.fn(),
    };
    const controller = new PortalPublicationReviewController(reviews as never);
    const req = { user: { id: 'actor', companyId: 'company' } };
    const dto = { action: 'retry' as const, reason: 'Reviewed account' };
    await controller.candidate('listing', 'job', 'MLA123', req);
    await controller.resolve('listing', 'job', dto, req);
    await controller.history('listing', req);
    expect(reviews.candidate).toHaveBeenCalledWith(
      'company',
      'listing',
      'job',
      'MLA123',
    );
    expect(reviews.resolve).toHaveBeenCalledWith(
      'company',
      'actor',
      'listing',
      'job',
      dto,
    );
    expect(reviews.history).toHaveBeenCalledWith('company', 'listing');
  });
});
