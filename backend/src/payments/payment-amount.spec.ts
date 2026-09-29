import { calculatePaymentAmount, paymentCents } from './payment-amount';
import { PaymentItemType } from './entities/payment-item.entity';

describe('Payment monetary validation', () => {
  it('adds cents, quantities and discounts exactly', () => {
    expect(
      calculatePaymentAmount({
        amount: 0.8,
        items: [{ amount: 0.1 }, { amount: 0.7 }],
      }),
    ).toBe(0.8);
    expect(
      calculatePaymentAmount({
        amount: 0.3,
        items: [
          { amount: 0.1, quantity: 4 },
          { amount: 0.1, type: PaymentItemType.DISCOUNT },
        ],
      }),
    ).toBe(0.3);
    expect(paymentCents('999999999999.99')).toBe(99999999999999n);
  });

  it.each([0, -1, NaN, Infinity, 0.001, 1.005, 1000000000000])(
    'rejects invalid amount %s',
    (amount) => {
      expect(() => calculatePaymentAmount({ amount })).toThrow();
    },
  );

  it('rejects a one-cent difference instead of silently using item totals', () => {
    expect(() =>
      calculatePaymentAmount({ amount: 100.02, items: [{ amount: 100.01 }] }),
    ).toThrow('does not match');
  });

  it.each([
    [{ amount: 0.005 }],
    [{ amount: 10000000000 }],
    [{ amount: 1, quantity: 0 }],
    [{ amount: 1, quantity: 1.5 }],
    [{ amount: 1, quantity: 2147483648 }],
    [{ amount: 9999999999.99, quantity: 101 }],
    [{ amount: 1, type: PaymentItemType.DISCOUNT }],
  ])(
    'rejects invalid item precision, quantity, total or sign %#',
    (...items) => {
      expect(() => calculatePaymentAmount({ items })).toThrow();
    },
  );
});
