import { EntityManager } from 'typeorm';
import {
  AdjustmentType,
  InflationIndexType,
  Lease,
} from '../leases/entities/lease.entity';
import { calculateRentAdjustment } from './rent-adjustment';

describe('audited rent calculation', () => {
  const query = jest.fn();
  const manager = { query } as unknown as EntityManager;
  const lease = (overrides: Partial<Lease> = {}) =>
    ({
      currency: 'ARS',
      monthlyRent: 1000,
      startDate: '2024-01-15',
      nextAdjustmentDate: '2025-01-15',
      adjustmentType: AdjustmentType.INFLATION_INDEX,
      inflationIndexType: InflationIndexType.ICL,
      adjustmentFrequencyMonths: 12,
      ...overrides,
    }) as Lease;
  const point = (date: string, value: string, kind = 'level') => ({
    id: date,
    date,
    value,
    revision: 1,
    value_kind: kind,
    source: 'fixture',
    source_series: 'fixture',
    source_url: 'https://example.test',
    retrieved_at: '2025-02-01',
  });
  beforeEach(() => query.mockReset().mockResolvedValue([]));
  it('uses the exact ICL dates and rounds half up only at the scheduled adjustment', async () => {
    query.mockResolvedValue([
      point('2024-01-15', '1.50'),
      point('2025-01-15', '2.47'),
    ]);
    const result = await calculateRentAdjustment(
      manager,
      lease(),
      new Date('2025-02-01'),
      true,
    );
    expect(result.rent).toBe(1646.67);
    expect(result.lastDate).toBe('2025-01-15');
    expect(result.nextDate).toBe('2026-01-15');
    expect(
      result.snapshot.adjustments[0].observations.map((row) => row.date),
    ).toEqual(['2024-01-15', '2025-01-15']);
  });
  it('uses the latest adjustment date as the next base', async () => {
    query.mockResolvedValue([
      point('2025-01-15', '2.47'),
      point('2026-01-15', '4.94'),
    ]);
    const result = await calculateRentAdjustment(
      manager,
      lease({
        monthlyRent: 1646.67,
        lastAdjustmentDate: new Date('2025-01-15'),
        nextAdjustmentDate: new Date('2026-01-15'),
      }),
      new Date('2026-01-15'),
      true,
    );
    expect(result.rent).toBe(3293.34);
  });
  it('accumulates IPC by ratio of monthly levels using explicit lag', async () => {
    query.mockResolvedValue([
      point('2023-12-01', '100'),
      point('2024-12-01', '121'),
    ]);
    const result = await calculateRentAdjustment(
      manager,
      lease({
        inflationIndexType: InflationIndexType.IPC,
        inflationIndexLagMonths: 1,
      }),
      new Date('2025-01-15'),
      true,
    );
    expect(result.rent).toBe(1210);
    expect(result.snapshot.adjustments[0].lagMonths).toBe(1);
  });
  it('compounds every monthly IGP-M percentage including deflation', async () => {
    query.mockResolvedValue([
      point('2024-01-01', '10', 'monthly_percent'),
      point('2024-02-01', '10', 'monthly_percent'),
      point('2024-03-01', '-1', 'monthly_percent'),
    ]);
    const result = await calculateRentAdjustment(
      manager,
      lease({
        inflationIndexType: InflationIndexType.IGP_M,
        inflationIndexLagMonths: 1,
        adjustmentFrequencyMonths: 3,
        nextAdjustmentDate: new Date('2024-04-15'),
      }),
      new Date('2024-04-15'),
      true,
    );
    expect(result.rent).toBe(1197.9);
    expect(result.snapshot.adjustments[0].observations).toHaveLength(3);
  });
  it('rejects a missing intermediate month without substituting another date', async () => {
    query.mockResolvedValue([
      point('2024-01-01', '10', 'monthly_percent'),
      point('2024-03-01', '10', 'monthly_percent'),
    ]);
    await expect(
      calculateRentAdjustment(
        manager,
        lease({
          inflationIndexType: InflationIndexType.IGP_M,
          inflationIndexLagMonths: 1,
          adjustmentFrequencyMonths: 3,
          nextAdjustmentDate: new Date('2024-04-15'),
        }),
        new Date('2024-04-15'),
        true,
      ),
    ).rejects.toThrow('2024-02-01');
  });
  it('never substitutes an earlier daily ICL point for a missing target', async () => {
    query.mockResolvedValue([
      point('2024-01-15', '1'),
      point('2025-01-14', '2'),
    ]);
    await expect(
      calculateRentAdjustment(manager, lease(), new Date('2025-01-15'), true),
    ).rejects.toThrow('2025-01-15');
  });
  it.each([null, undefined, -1, 13, 1.5])(
    'requires an explicit valid lag for monthly series: %s',
    async (lag) => {
      await expect(
        calculateRentAdjustment(
          manager,
          lease({
            inflationIndexType: InflationIndexType.IPC,
            inflationIndexLagMonths: lag,
          }),
          new Date('2025-01-15'),
          true,
        ),
      ).rejects.toThrow('lag');
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 1.5, 121])(
    'rejects invalid adjustment frequencies: %s',
    async (frequency) => {
      await expect(
        calculateRentAdjustment(
          manager,
          lease({ adjustmentFrequencyMonths: frequency }),
          new Date('2025-01-15'),
          true,
        ),
      ).rejects.toThrow('frequency');
    },
  );
  it('catches up missed percentage adjustments with cent rounding at each due date', async () => {
    const result = await calculateRentAdjustment(
      manager,
      lease({
        adjustmentType: AdjustmentType.PERCENTAGE,
        adjustmentValue: 10,
        adjustmentFrequencyMonths: 3,
        nextAdjustmentDate: new Date('2024-04-15'),
      }),
      new Date('2024-11-01'),
      true,
    );
    expect(result.rent).toBe(1331);
    expect(result.snapshot.adjustments.map((row) => row.effectiveDate)).toEqual(
      ['2024-04-15', '2024-07-15', '2024-10-15'],
    );
    expect(result.nextDate).toBe('2025-01-15');
    expect(query).not.toHaveBeenCalled();
  });
  it('preserves day 31 through clamped months and subsequent executions', async () => {
    const base = lease({
      adjustmentType: AdjustmentType.FIXED,
      adjustmentValue: 0.01,
      adjustmentFrequencyMonths: 1,
      nextAdjustmentDate: new Date('2024-01-31'),
    });
    const first = await calculateRentAdjustment(
      manager,
      base,
      new Date('2024-02-29'),
      true,
    );
    expect(first.rent).toBe(1000.02);
    expect(first.nextDate).toBe('2024-03-31');
    const second = await calculateRentAdjustment(
      manager,
      {
        ...base,
        monthlyRent: first.rent,
        lastAdjustmentDate: new Date(first.lastDate!),
        nextAdjustmentDate: new Date(first.nextDate!),
        adjustmentAnchorDate: new Date(first.anchor!),
      } as Lease,
      new Date('2024-04-30'),
      true,
    );
    expect(second.nextDate).toBe('2024-05-31');
    expect(second.rent).toBe(1000.04);
  });
  it('rounds exact half cents up without binary floating point error', async () => {
    const result = await calculateRentAdjustment(
      manager,
      lease({
        monthlyRent: 1,
        adjustmentType: AdjustmentType.PERCENTAGE,
        adjustmentValue: 0.5,
      }),
      new Date('2025-01-15'),
      true,
    );
    expect(result.rent).toBe(1.01);
  });
  it.each([false, true])(
    'rejects billing before an already applied rent adjustment even when apply=%s',
    async (apply) => {
      await expect(
        calculateRentAdjustment(
          manager,
          lease({ lastAdjustmentDate: new Date('2025-01-15') }),
          new Date('2024-12-01'),
          apply,
        ),
      ).rejects.toThrow('historical');
    },
  );
  it('keeps rent untouched when adjustment is disabled, not due or unscheduled', async () => {
    for (const [data, date, apply] of [
      [lease(), '2025-01-15', false],
      [lease(), '2025-01-01', true],
      [
        lease({ nextAdjustmentDate: null as unknown as Date }),
        '2025-01-15',
        true,
      ],
    ] as const) {
      const result = await calculateRentAdjustment(
        manager,
        data,
        new Date(date),
        apply,
      );
      expect(result.rent).toBe(1000);
      expect(result.snapshot.adjustments).toEqual([]);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it.each([
    { startDate: new Date('2025-01-15') },
    { adjustmentAnchorDate: new Date('2024-01-16') },
    { inflationIndexType: undefined },
    { monthlyRent: Infinity },
    { monthlyRent: 0.001 },
    { adjustmentType: AdjustmentType.PERCENTAGE, adjustmentValue: -101 },
    { adjustmentType: AdjustmentType.FIXED, adjustmentValue: -1001 },
    { adjustmentType: AdjustmentType.PERCENTAGE, adjustmentValue: 1000000000 },
  ])(
    'rejects ambiguous dates or unsupported monetary values',
    async (change) => {
      await expect(
        calculateRentAdjustment(
          manager,
          lease(change),
          new Date('2025-01-15'),
          true,
        ),
      ).rejects.toThrow();
    },
  );
});
