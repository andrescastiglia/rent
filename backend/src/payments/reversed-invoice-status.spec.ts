import { reversedInvoiceStatus } from './reversed-invoice-status';
import { InvoiceStatus } from './entities/invoice.entity';

describe('Invoice status after payment reversal', () => {
  const invoice = {
    status: InvoiceStatus.PAID,
    total: 100,
    dueDate: new Date('2026-09-29T00:00:00Z'),
  };

  it('uses remaining paid cents instead of an earlier allocation status', () => {
    expect(reversedInvoiceStatus(invoice, 1n, InvoiceStatus.PENDING)).toBe(
      InvoiceStatus.PARTIAL,
    );
    expect(reversedInvoiceStatus(invoice, 10000n, InvoiceStatus.PARTIAL)).toBe(
      InvoiceStatus.PAID,
    );
  });

  it.each([InvoiceStatus.CANCELLED, InvoiceStatus.REFUNDED])(
    'preserves terminal invoice state %s',
    (status) => {
      expect(
        reversedInvoiceStatus(
          { ...invoice, status },
          0n,
          InvoiceStatus.PENDING,
        ),
      ).toBe(status);
      expect(
        reversedInvoiceStatus({ ...invoice, status }, 10n, InvoiceStatus.PAID),
      ).toBe(status);
    },
  );

  it('marks overdue only after the due date ends in Argentina', () => {
    expect(
      reversedInvoiceStatus(
        invoice,
        0n,
        InvoiceStatus.SENT,
        new Date('2026-09-30T02:59:59Z'),
      ),
    ).toBe(InvoiceStatus.SENT);
    expect(
      reversedInvoiceStatus(
        invoice,
        0n,
        InvoiceStatus.SENT,
        new Date('2026-09-30T03:00:00Z'),
      ),
    ).toBe(InvoiceStatus.OVERDUE);
    expect(
      reversedInvoiceStatus(
        invoice,
        0n,
        InvoiceStatus.PARTIAL,
        new Date('2026-09-29T15:00:00Z'),
      ),
    ).toBe(InvoiceStatus.PENDING);
  });

  it('rejects a malformed historical due date instead of guessing', () => {
    expect(() =>
      reversedInvoiceStatus(
        { ...invoice, dueDate: '2026-02-30' as any },
        0n,
        InvoiceStatus.PENDING,
      ),
    ).toThrow('requires review');
  });
});
