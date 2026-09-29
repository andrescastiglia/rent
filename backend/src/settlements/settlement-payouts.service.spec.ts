import { ServiceUnavailableException } from '@nestjs/common';
import { SettlementPayoutsService } from './settlement-payouts.service';
import {
  RequestSettlementPayoutDto,
  ReviewSettlementPayoutDto,
} from './dto/settlement-payout.dto';
function setup(enabled = false) {
  const manager = { query: jest.fn() };
  const db = { manager, query: jest.fn(), transaction: jest.fn() };
  const client = {
    create: jest.fn(),
    transaction: jest.fn(),
    validate: jest.fn(),
  };
  const config = {
    enabled: () => enabled,
    assertEnabled: () => {
      if (!enabled) throw new ServiceUnavailableException('disabled');
    },
  };
  const service = new SettlementPayoutsService(
    db as never,
    client as never,
    config as never,
  );
  return { service, db, manager, client };
}
it('blocks payout mutations and workers before database or provider access while disabled', async () => {
  const f = setup();
  await expect(
    f.service.request(
      'settlement',
      'company',
      'actor',
      {} as RequestSettlementPayoutDto,
    ),
  ).rejects.toThrow('disabled');
  await expect(
    f.service.review(
      'settlement',
      'company',
      'actor',
      {} as ReviewSettlementPayoutDto,
    ),
  ).rejects.toThrow('disabled');
  expect(await f.service.processDue()).toMatchObject({
    processed: 0,
    disabled: true,
  });
  expect(f.db.query).not.toHaveBeenCalled();
  expect(f.db.transaction).not.toHaveBeenCalled();
  expect(f.manager.query).not.toHaveBeenCalled();
  expect(f.client.create).not.toHaveBeenCalled();
});
it('requires explicit company scope for reads, enqueue and review', async () => {
  const f = setup(true);
  await expect(f.service.overview('settlement', '')).rejects.toThrow(
    'Company scope required',
  );
  await expect(
    f.service.request(
      'settlement',
      '',
      'actor',
      {} as RequestSettlementPayoutDto,
    ),
  ).rejects.toThrow('Company scope required');
  await expect(
    f.service.review(
      'settlement',
      '',
      'actor',
      {} as ReviewSettlementPayoutDto,
    ),
  ).rejects.toThrow('Company scope required');
  expect(f.db.transaction).not.toHaveBeenCalled();
  expect(f.manager.query).not.toHaveBeenCalled();
});
it('requires confirmation before opening a transaction', async () => {
  const f = setup(true);
  await expect(
    f.service.request('settlement', 'company', 'actor', {
      confirmed: false,
    } as RequestSettlementPayoutDto),
  ).rejects.toThrow('confirmation');
  expect(f.db.transaction).not.toHaveBeenCalled();
});
it('keeps local empty payout history readable while disabled without reading a provider', async () => {
  const f = setup();
  f.manager.query.mockResolvedValue([{ id: 'settlement' }]);
  f.db.query.mockResolvedValue([]);
  expect(await f.service.overview('settlement', 'company')).toEqual({
    enabled: false,
    job: null,
    movements: [],
    reviews: [],
  });
  expect(f.client.transaction).not.toHaveBeenCalled();
});
it('hides absent settlements without reading payout history', async () => {
  const f = setup();
  f.manager.query.mockResolvedValue([]);
  await expect(f.service.overview('settlement', 'company')).rejects.toThrow(
    'Settlement not found',
  );
  expect(f.db.query).not.toHaveBeenCalled();
});
