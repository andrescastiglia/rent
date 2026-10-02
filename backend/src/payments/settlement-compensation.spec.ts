import {
  assertNoUncertainSettlementPayout,
  compensateTransferredAllocation,
} from './settlement-compensation';

const input = {
  companyId: 'company',
  invoiceId: 'invoice',
  paymentId: 'payment',
  referenceId: 'refund',
  amount: 5000n,
};
function fixture() {
  const source = {
    settlementId: 'settlement',
    currency: 'ARS',
    gross: '90.00',
    collected: '100.00',
    rate: '10.00',
  };
  let currentGross = '50.00';
  let priorGross = '0.00',
    priorCommission = '0.00';
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM settlement_generation_sources src JOIN'))
      return [source];
    if (sql.includes('SUM(gross_amount)'))
      return [{ gross: priorGross, commission: priorCommission }];
    if (sql.includes('SELECT CASE WHEN')) return [{ gross: currentGross }];
    return [];
  });
  return {
    source,
    query,
    manager: { query } as never,
    setCurrent: (value: string) => {
      currentGross = value;
    },
    setPrevious: (gross: string, commission: string) => {
      priorGross = gross;
      priorCommission = commission;
    },
  };
}
describe('Transferred settlement corrections', () => {
  it('uses the canonical remaining collection after conditional credits are cancelled', async () => {
    const f = fixture();
    await compensateTransferredAllocation(f.manager, input);
    const insert = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO settlement_source_compensations'),
    );
    expect(insert?.[1]).toEqual([
      'company',
      'settlement',
      'invoice',
      'payment',
      'refund',
      'ARS',
      50,
      40,
      4,
      36,
    ]);
  });
  it('rounds commission cumulatively and preserves the historical transfer', async () => {
    const f = fixture();
    f.setPrevious('40.00', '4.00');
    f.setCurrent('0.00');
    await compensateTransferredAllocation(f.manager, input);
    const insert = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO settlement_source_compensations'),
    );
    expect(insert?.[1]?.slice(-3)).toEqual([50, 5, 45]);
    expect(
      f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE settlements')),
    ).toBe(false);
  });
  it('keeps a rounded historical commission until remaining gross crosses its cent boundary', async () => {
    const f = fixture();
    Object.assign(f.source, {
      gross: '0.10',
      collected: '0.10',
      rate: '50.00',
    });
    f.setCurrent('0.09');
    await compensateTransferredAllocation(f.manager, { ...input, amount: 1n });
    const insert = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO settlement_source_compensations'),
    );
    expect(insert?.[1]?.slice(-3)).toEqual([0.01, 0, 0.01]);
    f.query.mockClear();
    f.setPrevious('0.01', '0.00');
    f.setCurrent('0.08');
    await compensateTransferredAllocation(f.manager, { ...input, amount: 1n });
    const next = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO settlement_source_compensations'),
    );
    expect(next?.[1]?.slice(-3)).toEqual([0.01, 0.01, 0]);
  });
  it('does not create duplicate debt when a cancelled invoice is later refunded', async () => {
    const f = fixture();
    f.setPrevious('90.00', '9.00');
    f.setCurrent('0.00');
    await compensateTransferredAllocation(f.manager, input);
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO settlement_source_compensations'),
      ),
    ).toBe(false);
  });
  it('does not charge owners when no transferred source exists', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await compensateTransferredAllocation({ query } as never, input);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it.each(['0.00', '-1.00'])(
    'refuses incompatible source amounts %s',
    async (collected) => {
      const f = fixture();
      f.source.collected = collected;
      await expect(
        compensateTransferredAllocation(f.manager, input),
      ).rejects.toThrow();
    },
  );
  it('requires source reconciliation for historical transferred collections', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'legacy' }]);
    await expect(
      assertNoUncertainSettlementPayout(
        { query } as never,
        'company',
        'invoice',
      ),
    ).rejects.toThrow('Historical transferred');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('blocks an in-flight payout until it is reconciled', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'uncertain-transfer' }]);
    await expect(
      assertNoUncertainSettlementPayout(
        { query } as never,
        'company',
        'invoice',
      ),
    ).rejects.toThrow('in-flight');
    query.mockResolvedValue([]);
    await expect(
      assertNoUncertainSettlementPayout(
        { query } as never,
        'company',
        'invoice',
      ),
    ).resolves.toBeUndefined();
  });
});
