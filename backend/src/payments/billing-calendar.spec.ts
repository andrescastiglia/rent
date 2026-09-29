import { computeBillingPeriod } from './billing-calendar';
import { Lease } from '../leases/entities/lease.entity';

const days = (value: ReturnType<typeof computeBillingPeriod>) =>
  Object.fromEntries(
    Object.entries(value).map(([key, date]) => [
      key,
      date.toISOString().slice(0, 10),
    ]),
  );
describe('billing calendar', () => {
  it.each(['UTC', 'America/Argentina/Buenos_Aires', 'Pacific/Honolulu'])(
    'preserves database calendar days and clamps February due dates in %s',
    (zone) => {
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        expect(
          days(
            computeBillingPeriod(
              {
                nextBillingDate: '2028-02-01',
                paymentFrequency: 'monthly',
                paymentDueDay: 31,
              } as unknown as Lease,
              {},
            ),
          ),
        ).toEqual({
          periodStart: '2028-02-01',
          periodEnd: '2028-02-29',
          dueDate: '2028-02-29',
        });
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );
  it('advances quarterly periods and rolls an earlier due day into the next month', () => {
    expect(
      days(
        computeBillingPeriod(
          {
            nextBillingDate: '2026-10-15',
            paymentFrequency: 'quarterly',
            paymentDueDay: 10,
          } as unknown as Lease,
          {},
        ),
      ),
    ).toEqual({
      periodStart: '2026-10-15',
      periodEnd: '2027-01-14',
      dueDate: '2026-11-10',
    });
  });
  it.each([
    { periodStart: '2026-10-01' },
    {
      periodStart: '2026-10-31',
      periodEnd: '2026-10-01',
      dueDate: '2026-11-10',
    },
    {
      periodStart: '2026-02-30',
      periodEnd: '2026-03-31',
      dueDate: '2026-03-10',
    },
  ])('rejects incomplete or invalid custom dates %j', (dto) => {
    expect(() => computeBillingPeriod({} as Lease, dto)).toThrow();
  });
});
