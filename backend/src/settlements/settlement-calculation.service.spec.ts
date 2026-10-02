import { ConflictException, NotFoundException } from '@nestjs/common';
import { SettlementCalculationService } from './settlement-calculation.service';

describe('Settlement calculation accounting invariants', () => {
  const request = {
    ownerId: 'owner',
    period: '2026-10',
    currency: 'ARS',
  };
  const invoice = () => ({
    id: 'invoice',
    invoiceNumber: 'INV-1',
    totalAmount: '100.00',
    paidAmount: '100.00',
    dueDate: '2026-10-10',
    validAccount: true,
    allocations: [
      {
        id: 'allocation',
        paymentId: 'payment',
        amount: '100.00',
        paymentDate: '2026-10-12',
        valid: true,
      },
    ],
    creditNotes: [] as { id: string; amount: string; currency: string }[],
  });
  let query: jest.Mock;
  let transaction: jest.Mock;
  let service: SettlementCalculationService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    transaction = jest.fn(async (_isolation, execute) => execute({ query }));
    service = new SettlementCalculationService({ transaction } as never);
  });

  function sources(rows = [invoice()], rate = '7.50') {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM owners')) return [{ commissionRate: rate }];
      if (sql.includes('FROM invoices i')) return rows;
      if (sql.includes('FROM settlements')) return [{ id: 'existing' }];
      return [];
    });
  }

  it('uses one read-only repeatable snapshot and the configured owner commission', async () => {
    const source = invoice();
    source.creditNotes = [{ id: 'credit', amount: '20.00', currency: 'ARS' }];
    sources([source]);
    const result = await service.preview('company', request);
    expect(transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(query.mock.calls[0]).toEqual(['SET TRANSACTION READ ONLY']);
    expect(result).toMatchObject({
      grossAmount: '80.00',
      commissionAmount: '6.00',
      netBeforeWithholdings: '74.00',
      scheduledDate: '2026-10-12',
      existingSettlementIds: ['existing'],
      invoices: [
        {
          collectedAmount: '100.00',
          creditedAmount: '20.00',
          grossAmount: '80.00',
          creditNotes: [{ id: 'credit', amount: '20.00' }],
          allocations: [
            {
              id: 'allocation',
              paymentId: 'payment',
              amount: '100.00',
              paymentDate: '2026-10-12',
            },
          ],
        },
      ],
    });
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('i.company_id=$1'),
      ['company', 'owner', 'ARS', '2026-10', null],
    );
  });

  it('rounds once across all invoices and never schedules before the due date', async () => {
    const first = invoice();
    first.totalAmount = first.paidAmount = first.allocations[0].amount = '0.05';
    first.allocations[0].paymentDate = '2026-10-01';
    const second = { ...first, id: 'second', dueDate: '2026-10-20' };
    sources([first, second], '10.00');
    await expect(service.preview('company', request)).resolves.toMatchObject({
      grossAmount: '0.10',
      commissionAmount: '0.01',
      netBeforeWithholdings: '0.09',
      scheduledDate: '2026-10-20',
    });
  });

  it('retains the reviewed historical commission and explicit reserved invoice set', async () => {
    sources();
    const result = await service.calculate(
      { query } as never,
      'company',
      request,
      ['invoice'],
      '12.00',
    );
    expect(result.commissionRate).toBe('12.00');
    expect(result.commissionAmount).toBe('12.00');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM invoices i'),
      ['company', 'owner', 'ARS', '2026-10', ['invoice']],
    );
  });

  it('returns a reproducible empty preview instead of inventing collections', async () => {
    sources([]);
    const first = await service.preview('company', request);
    const second = await service.preview('company', request);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      grossAmount: '0.00',
      commissionAmount: '0.00',
      netBeforeWithholdings: '0.00',
      scheduledDate: null,
      invoices: [],
    });
    expect(
      (await service.preview('another-company', request)).fingerprint,
    ).not.toBe(first.fingerprint);
  });

  it('does not expose a missing or foreign owner', async () => {
    await expect(service.preview('company', request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each(['-1.00', '1.001', 'NaN', '100.01'])(
    'rejects invalid commission %s before consulting financial sources',
    async (rate) => {
      sources([], rate);
      await expect(service.preview('company', request)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('FROM invoices i'),
        expect.anything(),
      );
    },
  );

  it.each([
    [
      'mismatched account',
      (row: ReturnType<typeof invoice>): unknown => (row.validAccount = false),
    ],
    [
      'invalid allocation',
      (row: ReturnType<typeof invoice>): unknown =>
        (row.allocations[0].valid = false),
    ],
    [
      'foreign currency credit',
      (row: ReturnType<typeof invoice>): unknown =>
        row.creditNotes.push({ id: 'c', amount: '1.00', currency: 'USD' }),
    ],
    [
      'missing allocations',
      (row: ReturnType<typeof invoice>): unknown => (row.allocations = []),
    ],
    [
      'incorrect invoice total',
      (row: ReturnType<typeof invoice>): unknown =>
        (row.totalAmount = '101.00'),
    ],
    [
      'incorrect paid amount',
      (row: ReturnType<typeof invoice>): unknown => (row.paidAmount = '99.00'),
    ],
    [
      'excess credit',
      (row: ReturnType<typeof invoice>): unknown =>
        row.creditNotes.push({ id: 'c', amount: '100.01', currency: 'ARS' }),
    ],
    [
      'invalid collection precision',
      (row: ReturnType<typeof invoice>): unknown =>
        (row.allocations[0].amount = '100.001'),
    ],
  ] as const)('requires accounting review for %s', async (_reason, change) => {
    const row = invoice();
    change(row);
    sources([row]);
    await expect(service.preview('company', request)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
