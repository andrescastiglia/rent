import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import {
  BankMatchStrategy,
  BankReconciliationStatus,
} from './entities/bank-reconciliation.entity';
import {
  BankMovementDirection,
  BankMovementStatus,
} from './entities/bank-movement.entity';
import { InvoiceStatus } from '../payments/entities/invoice.entity';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { BankReconciliationAlertStatus } from './entities/bank-reconciliation-alert.entity';

const fluentQuery = (result: { one?: unknown; many?: unknown[] }) => {
  const query: Record<string, jest.Mock> = {};
  for (const method of [
    'where',
    'andWhere',
    'innerJoin',
    'orderBy',
    'addOrderBy',
    'take',
  ]) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.getOne = jest.fn().mockResolvedValue(result.one ?? null);
  query.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  return query;
};

describe('BankReconciliationService', () => {
  const companyId = '10000000-0000-0000-0000-000000000001';
  const movementId = '20000000-0000-0000-0000-000000000001';
  const invoiceId = '30000000-0000-0000-0000-000000000001';
  const paymentId = '40000000-0000-0000-0000-000000000001';
  const reconciliationId = '50000000-0000-0000-0000-000000000001';

  let movements: any;
  let reconciliations: any;
  let bankAccounts: any;
  let invoices: any;
  let alerts: any;
  let payments: any;
  let dataSource: any;
  let service: BankReconciliationService;

  const movement = (overrides: Record<string, unknown> = {}) => ({
    id: movementId,
    companyId,
    provider: 'sandbox',
    externalId: 'external-1',
    direction: BankMovementDirection.CREDIT,
    amount: 1000,
    currency: 'ARS',
    occurredAt: new Date('2026-08-10T12:00:00.000Z'),
    status: BankMovementStatus.PENDING,
    bankAccount: { propertyId: '60000000-0000-0000-0000-000000000001' },
    ...overrides,
  });

  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: invoiceId,
    companyId,
    tenantAccountId: '70000000-0000-0000-0000-000000000001',
    status: InvoiceStatus.PENDING,
    ...overrides,
  });

  const reconciliation = (overrides: Record<string, unknown> = {}) => ({
    id: reconciliationId,
    companyId,
    movementId,
    invoiceId: null,
    paymentId: null,
    matchStrategy: null,
    status: BankReconciliationStatus.PROCESSING,
    reason: null,
    matchedAt: null,
    ...overrides,
  });

  beforeEach(() => {
    movements = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    reconciliations = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    bankAccounts = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    invoices = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
    alerts = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    payments = {
      create: jest.fn(),
      findOne: jest.fn(),
      confirm: jest.fn(),
    };
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
    service = new BankReconciliationService(
      movements,
      reconciliations,
      bankAccounts,
      invoices,
      alerts,
      payments,
      dataSource,
    );
  });

  it('protects batch reconciliation with a separately configured token', () => {
    const previous = process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN;
    delete process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN;
    expect(() => service.assertBatchToken('token')).toThrow(
      'token is not configured',
    );
    process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN = 'expected';
    expect(() => service.assertBatchToken()).toThrow('Invalid batch');
    expect(() => service.assertBatchToken('wrong')).toThrow('Invalid batch');
    expect(() => service.assertBatchToken('expected')).not.toThrow();
    if (previous === undefined) {
      delete process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN;
    } else {
      process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN = previous;
    }
  });

  it('resolves company scope before an internal reconciliation', async () => {
    const storedMovement = movement();
    const matched = reconciliation({
      status: BankReconciliationStatus.MATCHED,
    });
    movements.findOne
      .mockResolvedValueOnce(storedMovement)
      .mockResolvedValueOnce(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(matched)
      .mockResolvedValueOnce(matched);
    await expect(service.reconcileInternal(movementId)).resolves.toBe(matched);

    movements.findOne.mockReset().mockResolvedValue(null);
    await expect(service.reconcileInternal('missing')).rejects.toThrow(
      'Bank movement not found',
    );
  });

  it('lists and manually resolves company-scoped alerts', async () => {
    const openAlert = {
      id: 'alert-1',
      companyId,
      status: BankReconciliationAlertStatus.OPEN,
      resolvedAt: null,
      resolvedBy: null,
    };
    alerts.find.mockResolvedValue([openAlert]);
    await expect(service.findAlerts(companyId)).resolves.toEqual([openAlert]);
    expect(alerts.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId,
          status: BankReconciliationAlertStatus.OPEN,
        },
      }),
    );

    alerts.findOne.mockResolvedValue(openAlert);
    const resolved = await service.resolveAlert('alert-1', companyId, 'user-1');
    expect(resolved.status).toBe(BankReconciliationAlertStatus.RESOLVED);
    expect(resolved.resolvedBy).toBe('user-1');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    alerts.findOne.mockResolvedValue(null);
    await expect(
      service.resolveAlert('missing', companyId, 'user-1'),
    ).rejects.toThrow('Bank reconciliation alert not found');
  });

  it('ingests, matches by virtual account, confirms and returns a receipt-bearing reconciliation', async () => {
    const storedMovement = movement({ bankAccountId: 'bank-1' });
    const storedReconciliation = reconciliation();
    const result = reconciliation({
      invoiceId,
      paymentId,
      matchStrategy: BankMatchStrategy.VIRTUAL_ALIAS,
      status: BankReconciliationStatus.MATCHED,
      movement: storedMovement,
      payment: { id: paymentId, status: PaymentStatus.COMPLETED },
    });
    movements.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedMovement);
    bankAccounts.findOne.mockResolvedValue({ id: 'bank-1' });
    movements.create.mockReturnValue(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(result);
    reconciliations.create.mockReturnValue(storedReconciliation);
    invoices.createQueryBuilder.mockReturnValue(
      fluentQuery({ one: invoice() }),
    );
    payments.create.mockResolvedValue({ id: paymentId });
    payments.findOne.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.PENDING,
    });
    payments.confirm.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.COMPLETED,
    });

    await expect(
      service.ingestSandboxMovement(companyId, {
        externalId: 'external-1',
        direction: BankMovementDirection.CREDIT,
        amount: 1000,
        occurredAt: '2026-08-10T12:00:00.000Z',
        bankAccountId: 'bank-1',
      }),
    ).resolves.toBe(result);
    expect(payments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        paymentDate: '2026-08-10',
        reference: 'sandbox:external-1',
      }),
      undefined,
      companyId,
    );
    expect(payments.confirm).toHaveBeenCalledWith(paymentId, companyId);
    expect(storedMovement.status).toBe(BankMovementStatus.RECONCILED);
  });

  it('returns an already matched reconciliation for a duplicate external id', async () => {
    const storedMovement = movement();
    const matched = reconciliation({
      status: BankReconciliationStatus.MATCHED,
    });
    const expanded = { ...matched, movement: storedMovement };
    movements.findOne
      .mockResolvedValueOnce(storedMovement)
      .mockResolvedValueOnce(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(matched)
      .mockResolvedValueOnce(expanded);

    await expect(
      service.ingestSandboxMovement(companyId, {
        externalId: 'external-1',
        direction: BankMovementDirection.CREDIT,
        amount: 1000,
        occurredAt: '2026-08-10',
      }),
    ).resolves.toEqual(expanded);
    expect(movements.create).not.toHaveBeenCalled();
    expect(payments.create).not.toHaveBeenCalled();
  });

  it('recovers from concurrent movement ingestion through the unique key', async () => {
    const concurrentMovement = movement({ bankAccount: null });
    const matched = reconciliation({
      status: BankReconciliationStatus.MATCHED,
    });
    movements.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentMovement)
      .mockResolvedValueOnce(concurrentMovement);
    movements.create.mockReturnValue(concurrentMovement);
    movements.save.mockRejectedValueOnce({ code: '23505' });
    reconciliations.findOne
      .mockResolvedValueOnce(matched)
      .mockResolvedValueOnce(matched);

    await expect(
      service.ingestSandboxMovement(companyId, {
        externalId: 'external-1',
        direction: BankMovementDirection.CREDIT,
        amount: 1000,
        occurredAt: '2026-08-10',
      }),
    ).resolves.toBe(matched);
  });

  it('recovers from concurrent reconciliation creation through the unique key', async () => {
    const storedMovement = movement();
    const concurrent = reconciliation({
      status: BankReconciliationStatus.MATCHED,
    });
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrent)
      .mockResolvedValueOnce(concurrent);
    reconciliations.save.mockRejectedValueOnce({ code: '23505' });

    await expect(service.reconcile(movementId, companyId)).resolves.toBe(
      concurrent,
    );
  });

  it('ignores debit movements and records why they are unmatched', async () => {
    const debit = movement({ direction: BankMovementDirection.DEBIT });
    const storedReconciliation = reconciliation();
    movements.findOne.mockResolvedValue(debit);
    reconciliations.findOne.mockResolvedValue(null);
    reconciliations.create.mockReturnValue(storedReconciliation);

    const result = await service.reconcile(movementId, companyId);

    expect(result.status).toBe(BankReconciliationStatus.UNMATCHED);
    expect(result.reason).toContain('incoming credit');
    expect(debit.status).toBe(BankMovementStatus.IGNORED);
  });

  it('marks a credit unmatched when amount/date matching is ambiguous', async () => {
    const storedMovement = movement({ bankAccount: null });
    const storedReconciliation = reconciliation();
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne.mockResolvedValue(null);
    reconciliations.create.mockReturnValue(storedReconciliation);
    invoices.createQueryBuilder.mockReturnValue(
      fluentQuery({ many: [invoice(), invoice({ id: 'other' })] }),
    );

    const result = await service.reconcile(movementId, companyId);

    expect(result.status).toBe(BankReconciliationStatus.UNMATCHED);
    expect(storedMovement.status).toBe(BankMovementStatus.UNMATCHED);
  });

  it('matches a unique invoice by exact amount and date', async () => {
    const storedMovement = movement({ bankAccount: null });
    const storedReconciliation = reconciliation();
    const final = reconciliation({
      invoiceId,
      paymentId,
      matchStrategy: BankMatchStrategy.EXACT_AMOUNT_DATE,
      status: BankReconciliationStatus.MATCHED,
    });
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(final);
    reconciliations.create.mockReturnValue(storedReconciliation);
    invoices.createQueryBuilder.mockReturnValue(
      fluentQuery({ many: [invoice()] }),
    );
    payments.create.mockResolvedValue({ id: paymentId });
    payments.findOne.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.COMPLETED,
    });

    await expect(service.reconcile(movementId, companyId)).resolves.toBe(final);
    expect(payments.confirm).not.toHaveBeenCalled();
    expect(storedReconciliation.matchStrategy).toBe(
      BankMatchStrategy.EXACT_AMOUNT_DATE,
    );
  });

  it('resumes a saved invoice and payment after an interrupted attempt', async () => {
    const storedMovement = movement();
    const storedReconciliation = reconciliation({
      invoiceId,
      paymentId,
      matchStrategy: BankMatchStrategy.VIRTUAL_ALIAS,
      status: BankReconciliationStatus.FAILED,
    });
    const final = {
      ...storedReconciliation,
      status: BankReconciliationStatus.MATCHED,
    };
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(storedReconciliation)
      .mockResolvedValueOnce(final);
    invoices.findOne.mockResolvedValue(invoice());
    payments.findOne.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.PENDING,
    });
    payments.confirm.mockResolvedValue({ status: PaymentStatus.COMPLETED });

    await expect(service.reconcile(movementId, companyId)).resolves.toBe(final);
    expect(payments.create).not.toHaveBeenCalled();
    expect(payments.confirm).toHaveBeenCalledWith(paymentId, companyId);
  });

  it('persists a failed status for a non-confirmable payment', async () => {
    const storedMovement = movement();
    const storedReconciliation = reconciliation({
      invoiceId,
      paymentId,
      matchStrategy: BankMatchStrategy.VIRTUAL_ALIAS,
    });
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne.mockResolvedValue(storedReconciliation);
    invoices.findOne.mockResolvedValue(invoice());
    payments.findOne.mockResolvedValue({
      id: paymentId,
      status: PaymentStatus.FAILED,
    });

    await expect(service.reconcile(movementId, companyId)).rejects.toThrow(
      BadRequestException,
    );
    expect(storedReconciliation.status).toBe(BankReconciliationStatus.FAILED);
    expect(storedReconciliation.reason).toContain('non-confirmable');
  });

  it('rejects a missing explicit bank account', async () => {
    movements.findOne
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => movement({ bankAccount: null }));
    bankAccounts.findOne.mockResolvedValue(null);
    await expect(
      service.ingestSandboxMovement(companyId, {
        externalId: 'external-2',
        direction: BankMovementDirection.CREDIT,
        amount: 10,
        occurredAt: '2026-08-10',
        bankAccountId: 'missing',
      }),
    ).rejects.toThrow('Active bank account not found');
  });

  it('resolves exactly one alias and leaves absent or ambiguous aliases unresolved', async () => {
    movements.findOne
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => movement({ bankAccount: null }));
    movements.create.mockImplementation((value: any) => ({
      id: movementId,
      bankAccount: null,
      ...value,
    }));
    reconciliations.findOne.mockResolvedValue(null);
    reconciliations.create.mockReturnValue(reconciliation());
    invoices.createQueryBuilder.mockReturnValue(fluentQuery({ many: [] }));

    bankAccounts.createQueryBuilder.mockReturnValueOnce(
      fluentQuery({ many: [{ id: 'alias-account' }] }),
    );
    await service.ingestSandboxMovement(companyId, {
      externalId: 'alias-one',
      direction: BankMovementDirection.CREDIT,
      amount: 10,
      occurredAt: '2026-08-10',
      description: 'alias.one',
    });
    expect(movements.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ bankAccountId: 'alias-account' }),
    );

    movements.findOne
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockImplementation(async () => movement({ bankAccount: null }));
    bankAccounts.createQueryBuilder.mockReturnValueOnce(
      fluentQuery({ many: [{ id: 'one' }, { id: 'two' }] }),
    );
    await service.ingestSandboxMovement(companyId, {
      externalId: 'alias-many',
      direction: BankMovementDirection.CREDIT,
      amount: 10,
      occurredAt: '2026-08-10',
      description: 'ambiguous aliases',
    });
    expect(movements.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ bankAccountId: null }),
    );
  });

  it('ingests a movement without description without attempting alias lookup', async () => {
    const storedMovement = movement({ bankAccount: null });
    movements.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedMovement);
    movements.create.mockReturnValue(storedMovement);
    reconciliations.findOne.mockResolvedValue(null);
    reconciliations.create.mockReturnValue(reconciliation());
    invoices.createQueryBuilder.mockReturnValue(fluentQuery({ many: [] }));

    await service.ingestSandboxMovement(companyId, {
      externalId: 'without-description',
      direction: BankMovementDirection.CREDIT,
      amount: 10,
      occurredAt: '2026-08-10',
    });

    expect(bankAccounts.createQueryBuilder).not.toHaveBeenCalled();
    expect(movements.create).toHaveBeenCalledWith(
      expect.objectContaining({ bankAccountId: null, currency: 'ARS' }),
    );
  });

  it('throws when movement or expanded reconciliation is not found', async () => {
    movements.findOne.mockResolvedValue(null);
    await expect(service.reconcile(movementId, companyId)).rejects.toThrow(
      NotFoundException,
    );

    const storedMovement = movement();
    movements.findOne.mockResolvedValue(storedMovement);
    reconciliations.findOne
      .mockResolvedValueOnce(
        reconciliation({ status: BankReconciliationStatus.MATCHED }),
      )
      .mockResolvedValueOnce(null);
    await expect(service.reconcile(movementId, companyId)).rejects.toThrow(
      'Bank reconciliation not found',
    );
  });
});
