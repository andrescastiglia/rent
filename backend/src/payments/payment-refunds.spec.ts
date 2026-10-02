import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { TenantAccount } from './entities/tenant-account.entity';
import { CreditNote } from './entities/credit-note.entity';
import { Receipt } from './entities/receipt.entity';
import { EntityManager } from 'typeorm';

function fixture() {
  const payment = {
    id: 'payment',
    companyId: 'company',
    amount: 120,
    refundedAmount: 0,
    status: PaymentStatus.COMPLETED,
    allocationsRecorded: true,
    tenantAccountId: 'account',
    currencyCode: 'ARS',
  };
  const invoices = [
    {
      id: 'first',
      amountPaid: 40,
      total: 40,
      status: InvoiceStatus.PAID,
      dueDate: '2080-01-01',
    },
    {
      id: 'second',
      amountPaid: 60,
      total: 60,
      status: InvoiceStatus.PAID,
      dueDate: '2080-02-01',
    },
  ];
  const allocations = [
    {
      id: 'second-allocation',
      invoiceId: 'second',
      amount: 60,
      refundedAmount: 0,
      previousInvoiceStatus: InvoiceStatus.PENDING,
      reversedAt: null as Date | null,
    },
    {
      id: 'first-allocation',
      invoiceId: 'first',
      amount: 40,
      refundedAmount: 0,
      previousInvoiceStatus: InvoiceStatus.PENDING,
      reversedAt: null as Date | null,
    },
  ];
  const receipt = { cancelledAt: null as Date | null };
  const records: Record<string, unknown>[] = [];
  const repositories = new Map<unknown, unknown>([
    [
      Payment,
      {
        findOne: jest.fn(async () => payment),
        update: jest.fn(async (_id, value) => Object.assign(payment, value)),
      },
    ],
    [
      Invoice,
      {
        findOne: jest.fn(async ({ where }) =>
          invoices.find((i) => i.id === where.id),
        ),
        save: jest.fn(async (v) => v),
      },
    ],
    [
      PaymentAllocation,
      {
        find: jest.fn(async () => allocations.filter((a) => !a.reversedAt)),
        save: jest.fn(async (v) => v),
      },
    ],
    [
      TenantAccount,
      { findOne: jest.fn(async () => ({ currencyCode: 'ARS' })) },
    ],
    [CreditNote, { find: jest.fn(async () => []) }],
    [
      Receipt,
      { findOne: jest.fn(async () => receipt), save: jest.fn(async (v) => v) },
    ],
  ]);
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith('SELECT * FROM payment_refunds'))
        return records.filter((r) => r.reference === params[2]);
      if (sql.includes('INSERT INTO payment_refunds')) {
        const row = {
          id: params[0],
          amount: params[3],
          reference: params[5],
          reason: params[6],
        };
        records.push(row);
        return [row];
      }
      return [];
    }),
    getRepository: jest.fn((entity) => repositories.get(entity)),
  };
  let balance = -20;
  const accounts = {
    addMovementWithManager: jest.fn(async (_manager, { amount }) => {
      balance += amount;
    }),
  };
  const service = new PaymentsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    accounts as never,
    {} as never,
  );
  const refund = (amount: number, reference: string) =>
    service.refundWithManager(
      manager as unknown as EntityManager,
      'payment',
      'company',
      { amount, reference, reason: 'Devolución acordada' },
    );
  return {
    service,
    payment,
    invoices,
    allocations,
    receipt,
    manager,
    accounts,
    refund,
    records,
    balance: () => balance,
  };
}

describe('Audited partial payment refunds', () => {
  it('returns unapplied credit first, then reverses the latest allocation in exact cents', async () => {
    const f = fixture();
    await f.refund(50, 'first-refund');
    expect(f.balance()).toBe(30);
    expect(f.payment.refundedAmount).toBe(50);
    expect(f.invoices[0].amountPaid).toBe(40);
    expect(f.invoices[1].amountPaid).toBe(30);
    expect(f.invoices[1].status).toBe(InvoiceStatus.PARTIAL);
    expect(f.allocations[0].refundedAmount).toBe(30);
    expect(f.receipt.cancelledAt).toBeNull();
  });

  it('completes a refund without canceling the same allocation or receipt twice', async () => {
    const f = fixture();
    await f.refund(50, 'first-refund');
    await f.refund(70, 'last-refund');
    expect(f.balance()).toBe(100);
    expect(f.payment.status).toBe(PaymentStatus.REFUNDED);
    expect(f.invoices.map((i) => i.amountPaid)).toEqual([0, 0]);
    expect(f.allocations.every((a) => a.reversedAt instanceof Date)).toBe(true);
    expect(f.receipt.cancelledAt).toBeInstanceOf(Date);
    const replay = await f.refund(70, 'last-refund');
    expect(replay.id).toBe(f.records[1].id);
    expect(f.accounts.addMovementWithManager).toHaveBeenCalledTimes(2);
  });

  it('cancels only the remaining money after a partial refund', async () => {
    const f = fixture();
    await f.refund(50, 'first-refund');
    await f.service.cancelWithManager(
      f.manager as unknown as EntityManager,
      'payment',
      'company',
    );
    expect(f.balance()).toBe(100);
    expect(f.payment.status).toBe(PaymentStatus.CANCELLED);
    expect(f.invoices.map((i) => i.amountPaid)).toEqual([0, 0]);
    expect(f.accounts.addMovementWithManager).toHaveBeenLastCalledWith(
      f.manager,
      expect.objectContaining({ amount: 70 }),
    );
  });

  it.each([0, -1, 120.01, 0.001])(
    'rejects invalid amount %s before a ledger write',
    async (amount) => {
      const f = fixture();
      await expect(f.refund(amount, 'invalid')).rejects.toThrow();
      expect(f.accounts.addMovementWithManager).not.toHaveBeenCalled();
      expect(f.records).toHaveLength(0);
    },
  );

  it('rejects reusing a refund reference for another amount', async () => {
    const f = fixture();
    await f.refund(1, 'same-reference');
    await expect(f.refund(2, 'same-reference')).rejects.toThrow(
      'another correction',
    );
    expect(f.accounts.addMovementWithManager).toHaveBeenCalledTimes(1);
  });

  it('rejects historical payments without allocations and requires a stable request key', async () => {
    const f = fixture();
    f.payment.allocationsRecorded = false;
    await expect(f.refund(1, 'legacy')).rejects.toThrow('allocation history');
    await expect(
      f.service.refund('payment', 'company', {
        amount: 1,
        reason: 'Devolución',
      }),
    ).rejects.toThrow('Idempotency-Key');
  });
});
