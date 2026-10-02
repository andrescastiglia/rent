import {
  argentinaCalendarDay,
  calculateLateFeeEvidence,
} from './late-fee-calculation';
import { LateFeeType } from '../leases/entities/lease.entity';
const invoice = {
  id: 'invoice-1',
  status: 'partial',
  dueDate: '2026-09-28',
  total: '100.00',
  amountPaid: '20.00',
  currencyCode: 'USD',
};
const fixture = (type = LateFeeType.DAILY_PERCENTAGE, value = '1.00') => ({
  currencyCode: 'USD',
  lease: { lateFeeType: type, lateFeeValue: value, lateFeeGraceDays: 0 },
  invoices: [{ ...invoice }],
});
const asOf = '2026-10-01';
describe('Audited optional late fees', () => {
  it.each([
    [LateFeeType.DAILY_PERCENTAGE, '1.00', 2.4],
    [LateFeeType.PERCENTAGE, '1.25', 1],
    [LateFeeType.DAILY_FIXED, '0.29', 0.87],
    [LateFeeType.FIXED, '0.29', 0.29],
  ])('calculates %s exactly in the source currency', (type, value, amount) => {
    const result = calculateLateFeeEvidence(fixture(type, value), asOf);
    expect(result.amount).toBe(amount);
    expect(result.sources[0]).toEqual(
      expect.objectContaining({
        invoiceId: 'invoice-1',
        pendingAmount: '80.00',
        daysOverdue: 3,
      }),
    );
    expect(result.currency).toBe('USD');
  });
  it('uses Argentina midnight and leaves date-only due dates intact', () => {
    expect(argentinaCalendarDay(new Date('2026-10-02T02:59:59Z'))).toBe(
      '2026-10-01',
    );
    expect(argentinaCalendarDay(new Date('2026-10-02T03:00:00Z'))).toBe(
      '2026-10-02',
    );
    const input = fixture();
    input.invoices[0].dueDate = '2026-10-01';
    expect(calculateLateFeeEvidence(input, asOf).amount).toBe(0);
  });
  it('charges only calendar days after grace', () => {
    const input = fixture();
    input.lease.lateFeeGraceDays = 2;
    const result = calculateLateFeeEvidence(input, asOf);
    expect(result.amount).toBe(0.8);
    expect(result.sources[0].chargeableDays).toBe(1);
    input.lease.lateFeeGraceDays = 3;
    expect(calculateLateFeeEvidence(input, asOf).amount).toBe(0);
  });
  it('applies one total cap across sources in stable invoice order', () => {
    const input = {
      ...fixture(),
      lease: { ...fixture().lease, lateFeeMax: '3.00' },
    };
    input.invoices.push({ ...invoice, id: 'invoice-2' });
    const result = calculateLateFeeEvidence(input, asOf);
    expect(result.amount).toBe(3);
    expect(result.sources.map((source) => source.amount)).toEqual([
      '2.40',
      '0.60',
    ]);
  });
  it('does not bill the same accrued late fee twice and charges only newly accrued cents', () => {
    const input = fixture();
    const first = calculateLateFeeEvidence(input, asOf);
    const billed = {
      ...invoice,
      id: 'fee-invoice',
      status: 'paid',
      lateFee: '2.40',
      lateFeeCalculation: first,
    };
    const withHistory = { ...input, invoices: [...input.invoices, billed] };
    expect(calculateLateFeeEvidence(withHistory, asOf).amount).toBe(0);
    const next = calculateLateFeeEvidence(withHistory, '2026-10-02');
    expect(next.amount).toBe(0.8);
    expect(next.sources[0].previouslyCharged).toBe('2.40');
  });
  it('counts cancellation of an earlier late fee document as unbilled without compounding interest', () => {
    const input = fixture();
    const first = calculateLateFeeEvidence(input, asOf);
    const withHistory = {
      ...input,
      invoices: [
        ...input.invoices,
        {
          ...invoice,
          id: 'fee-invoice',
          status: 'cancelled',
          lateFee: '2.40',
          lateFeeCalculation: first,
        },
      ],
    };
    expect(calculateLateFeeEvidence(withHistory, asOf).amount).toBe(2.4);
    const withFee = {
      ...input,
      invoices: [
        {
          ...invoice,
          total: '102.40',
          lateFee: '2.40',
          lateFeeCalculation: first,
        },
      ],
    };
    expect(calculateLateFeeEvidence(withFee, '2026-10-02').amount).toBe(0.8);
  });
  it('respects cap remaining after a prior auditable charge', () => {
    const input = {
      ...fixture(),
      lease: { ...fixture().lease, lateFeeMax: '3.00' },
    };
    const first = calculateLateFeeEvidence(input, asOf);
    const withHistory = {
      ...input,
      invoices: [
        ...input.invoices,
        {
          ...invoice,
          id: 'fee-invoice',
          status: 'paid',
          lateFee: '2.40',
          lateFeeCalculation: first,
        },
      ],
    };
    expect(calculateLateFeeEvidence(withHistory, '2026-10-04').amount).toBe(
      0.6,
    );
  });
  it.each(['paid', 'draft', 'cancelled', 'refunded'])(
    'skips %s principal',
    (status) => {
      const input = fixture();
      input.invoices[0].status = status;
      expect(calculateLateFeeEvidence(input, asOf).amount).toBe(0);
    },
  );
  it('skips cleared principal and an unconfigured policy', () => {
    const input = fixture();
    input.invoices[0].amountPaid = '100.00';
    expect(calculateLateFeeEvidence(input, asOf).amount).toBe(0);
    expect(calculateLateFeeEvidence(null, asOf).amount).toBe(0);
    expect(
      calculateLateFeeEvidence(fixture(LateFeeType.NONE), asOf).amount,
    ).toBe(0);
  });
  it.each(['2026-02-30', 'wrong'])(
    'refuses incompatible historical due dates %s',
    (date) => {
      const input = fixture();
      input.invoices[0].dueDate = date;
      expect(() => calculateLateFeeEvidence(input, asOf)).toThrow(
        'historical invoice date',
      );
    },
  );
  it('requires reconciliation of legacy late fees instead of silently re-billing them', () => {
    const input = fixture();
    expect(() =>
      calculateLateFeeEvidence(
        { ...input, invoices: [{ ...invoice, lateFee: '1.00' }] },
        asOf,
      ),
    ).toThrow('source reconciliation');
    const evidence = calculateLateFeeEvidence(input, asOf);
    expect(() =>
      calculateLateFeeEvidence(
        {
          ...input,
          invoices: [
            { ...invoice, lateFee: '1.00', lateFeeCalculation: evidence },
          ],
        },
        asOf,
      ),
    ).toThrow('incompatible');
  });
  it('refuses mixed currencies, invalid grace and unknown fee modes', () => {
    const input = fixture();
    input.invoices[0].currencyCode = 'ARS';
    expect(() => calculateLateFeeEvidence(input, asOf)).toThrow(
      'different currencies',
    );
    expect(() =>
      calculateLateFeeEvidence(
        { ...fixture(), lease: { ...fixture().lease, lateFeeGraceDays: -1 } },
        asOf,
      ),
    ).toThrow('grace');
    expect(() =>
      calculateLateFeeEvidence(
        { ...fixture(), lease: { ...fixture().lease, lateFeeType: 'unknown' } },
        asOf,
      ),
    ).toThrow('Unsupported');
  });
});
