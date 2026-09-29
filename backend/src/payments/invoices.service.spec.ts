import { InvoicePdfService } from './invoice-pdf.service';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import {
  CommissionInvoice,
  CommissionInvoiceStatus,
} from './entities/commission-invoice.entity';
import {
  Lease,
  AdjustmentType,
  InflationIndexType,
} from '../leases/entities/lease.entity';
import { InflationIndex } from './entities/inflation-index.entity';
import { TenantAccountsService } from './tenant-accounts.service';
import { UserRole } from '../users/entities/user.entity';
import { MovementType } from './entities/tenant-account-movement.entity';

describe('InvoicesService', () => {
  let service: InvoicesService;
  let invoicesRepository: MockRepository<Invoice>;
  let _commissionRepository: MockRepository<CommissionInvoice>;
  let leasesRepository: MockRepository<Lease>;
  let inflationIndexRepository: MockRepository<InflationIndex>;
  let tenantAccountsService: Partial<TenantAccountsService>;
  let dataSource: { transaction: jest.Mock };
  let manager: any;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    tenantAccountsService = {
      findByLease: jest.fn(),
      calculateLateFee: jest.fn(),
      addMovement: jest.fn(),
      addMovementWithManager: jest.fn(),
    };
    manager = {
      query: jest.fn(async (sql: string) =>
        sql.includes('AS sequence') ? [{ sequence: '10' }] : [],
      ),
      getRepository: (entity: unknown) => {
        if (entity === Invoice) return invoicesRepository;
        if (entity === CommissionInvoice) return _commissionRepository;
        if (entity === Lease) return leasesRepository;
        if (entity === InflationIndex) return inflationIndexRepository;
        throw new Error('Unexpected transaction repository');
      },
    };
    dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        {
          provide: InvoicePdfService,
          useValue: {
            captureSnapshot: jest.fn().mockResolvedValue({ version: 1 }),
          },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(CommissionInvoice),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(InflationIndex),
          useValue: createMockRepository(),
        },
        { provide: TenantAccountsService, useValue: tenantAccountsService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(InvoicesService);
    invoicesRepository = module.get(getRepositoryToken(Invoice));
    _commissionRepository = module.get(getRepositoryToken(CommissionInvoice));
    leasesRepository = module.get(getRepositoryToken(Lease));
    leasesRepository.findOneOrFail!.mockImplementation((...args) =>
      leasesRepository.findOne!(...args),
    );
    inflationIndexRepository = module.get(getRepositoryToken(InflationIndex));
  });

  it('recovers the immutable generation result without reloading a changed or removed lease', async () => {
    const archived = {
      id: 'invoice-original',
      status: 'pending',
      issuedAt: '2026-01-01T12:00:00Z',
    };
    manager.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM invoice_generations')
        ? [{ matches: true, result_snapshot: archived }]
        : [],
    );
    const result = await service.generateForLease(
      'lease-1',
      { idempotencyKey: '22222222-2222-4222-8222-222222222222' },
      'company-1',
      undefined,
      true,
    );
    expect(result).toEqual(archived);
    expect(leasesRepository.findOne).not.toHaveBeenCalled();
    expect(invoicesRepository.save).not.toHaveBeenCalled();
  });

  it.each([
    { matches: false, result_snapshot: {} },
    { matches: true, result_snapshot: null },
  ])('refuses mismatched or legacy execution receipts', async (previous) => {
    manager.query.mockImplementation(async (sql: string) =>
      sql.includes('FROM invoice_generations') ? [previous] : [],
    );
    await expect(
      service.generateForLease(
        'lease-1',
        { idempotencyKey: '22222222-2222-4222-8222-222222222222' },
        'company-1',
        undefined,
        true,
      ),
    ).rejects.toThrow();
    expect(invoicesRepository.save).not.toHaveBeenCalled();
  });

  it('should apply late fee when requested', async () => {
    const lease = {
      id: 'lease-1',
      companyId: 'company-1',
      ownerId: 'owner-1',
      monthlyRent: 1000,
      currency: 'ARS',
      paymentFrequency: 'monthly',
      paymentDueDay: 10,
      additionalExpenses: 0,
      nextAdjustmentDate: null,
    } as unknown as Lease;

    leasesRepository.findOne!.mockResolvedValue(lease);
    (tenantAccountsService.findByLease as jest.Mock).mockResolvedValue({
      currencyCode: 'ARS',
      id: 'acc-1',
    });
    (tenantAccountsService.calculateLateFee as jest.Mock).mockResolvedValue(
      100,
    );
    invoicesRepository.create!.mockImplementation((data) => data);
    invoicesRepository.save!.mockImplementation(async (data) => ({
      id: 'inv-1',
      ...data,
    }));
    leasesRepository.save!.mockResolvedValue(lease);

    await service.generateForLease(
      'lease-1',
      { applyLateFee: true },
      'company-1',
    );

    expect(tenantAccountsService.calculateLateFee).toHaveBeenCalledWith(
      'acc-1',
      'company-1',
      manager,
    );
    expect(invoicesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lateFee: 100,
        total: 1100,
      }),
    );
  });

  it('should auto-calculate billing period and due date', async () => {
    const lease = {
      id: 'lease-2',
      companyId: 'company-1',
      ownerId: 'owner-1',
      monthlyRent: 2000,
      currency: 'ARS',
      paymentFrequency: 'monthly',
      paymentDueDay: 5,
      additionalExpenses: 0,
      nextBillingDate: new Date('2025-01-01T00:00:00Z'),
      nextAdjustmentDate: null,
    } as unknown as Lease;

    leasesRepository.findOne!.mockResolvedValue(lease);
    (tenantAccountsService.findByLease as jest.Mock).mockResolvedValue({
      currencyCode: 'ARS',
      id: 'acc-1',
    });
    invoicesRepository.create!.mockImplementation((data) => data);
    invoicesRepository.save!.mockImplementation(async (data) => ({
      id: 'inv-2',
      ...data,
    }));
    leasesRepository.save!.mockResolvedValue(lease);

    await service.generateForLease(
      'lease-2',
      { applyLateFee: false },
      'company-1',
    );

    const created = invoicesRepository.create!.mock.calls[0][0];
    expect(new Date(created.periodStart).toISOString()).toBe(
      '2025-01-01T12:00:00.000Z',
    );
    expect(new Date(created.periodEnd).getUTCDate()).toBe(31);
    expect(new Date(created.dueDate).getDate()).toBe(5);
  });

  it('uses accumulated IPC levels and saves the calculation with the lease update', async () => {
    const lease = {
      id: 'lease-3',
      currency: 'ARS',
      startDate: '2024-01-01',
      monthlyRent: 1000,
      adjustmentType: AdjustmentType.INFLATION_INDEX,
      inflationIndexType: InflationIndexType.IPC,
      inflationIndexLagMonths: 1,
      adjustmentFrequencyMonths: 12,
      nextAdjustmentDate: '2025-01-01',
    } as unknown as Lease;
    manager.query.mockResolvedValue([
      {
        id: 'base',
        date: '2023-12-01',
        value: '100',
        revision: 1,
        value_kind: 'level',
      },
      {
        id: 'end',
        date: '2024-12-01',
        value: '150',
        revision: 1,
        value_kind: 'level',
      },
    ]);
    const result = await (service as any).applyAdjustmentIfNeeded(
      lease,
      new Date('2025-01-01'),
      true,
      manager,
    );
    expect(result.rent).toBe(1500);
    expect(
      result.snapshot.adjustments[0].observations.map((row: any) => row.id),
    ).toEqual(['base', 'end']);
    expect(leasesRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ monthlyRent: 1500 }),
    );
    expect(inflationIndexRepository.findOne).not.toHaveBeenCalled();
  });

  it('create throws when lease does not exist', async () => {
    leasesRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.create({ leaseId: 'missing', subtotal: 10 } as any, 'company-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(leasesRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing', companyId: 'company-1' },
      }),
    );
  });

  it('does not silently advance adjustment dates when the required index is unavailable', async () => {
    inflationIndexRepository.findOne!.mockResolvedValue(null);
    const lease = {
      monthlyRent: 1000,
      startDate: '2025-01-01',
      inflationIndexLagMonths: 1,
      nextAdjustmentDate: new Date('2026-01-01'),
      adjustmentType: AdjustmentType.INFLATION_INDEX,
      inflationIndexType: InflationIndexType.IPC,
    };
    await expect(
      (service as any).applyAdjustmentIfNeeded(
        lease,
        new Date('2026-02-01'),
        true,
        manager,
      ),
    ).rejects.toThrow('Inflation observation unavailable');
    expect(leasesRepository.save).not.toHaveBeenCalled();
    expect(lease.monthlyRent).toBe(1000);
  });

  it('create throws when owner is missing on lease', async () => {
    leasesRepository.findOne!.mockResolvedValue({
      id: 'lease-1',
      property: null,
      ownerId: null,
    } as any);
    (tenantAccountsService.findByLease as jest.Mock).mockResolvedValue({
      currencyCode: 'ARS',
      id: 'acc-1',
    });

    await expect(
      service.create(
        {
          leaseId: 'lease-1',
          subtotal: 100,
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          dueDate: new Date('2025-02-10'),
        } as any,
        'company-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create persists draft invoice with computed total', async () => {
    leasesRepository.findOne!.mockResolvedValue({
      id: 'lease-1',
      companyId: 'company-1',
      currency: 'ARS',
      ownerId: 'owner-1',
      property: { ownerId: 'owner-1' },
    } as any);
    (tenantAccountsService.findByLease as jest.Mock).mockResolvedValue({
      currencyCode: 'ARS',
      id: 'acc-1',
    });
    jest
      .spyOn(service, 'generateInvoiceNumber')
      .mockResolvedValue('INV-202501-0001');
    invoicesRepository.create!.mockImplementation((d) => d);
    invoicesRepository.save!.mockImplementation(async (d) => d);

    const result = await service.create(
      {
        leaseId: 'lease-1',
        subtotal: 100,
        lateFee: 10,
        adjustments: -5,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        dueDate: new Date('2025-02-10'),
        notes: 'note',
      } as any,
      'company-1',
    );

    expect(result.total).toBe(105);
    expect(result.status).toBe(InvoiceStatus.DRAFT);
  });

  it('issue rejects non-draft invoices', async () => {
    invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.PAID,
    } as any);

    await expect(service.issue('inv-1', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('issue marks invoice pending and creates account movement', async () => {
    const draft = {
      id: 'inv-1',
      status: InvoiceStatus.DRAFT,
      tenantAccountId: 'acc-1',
      total: 120,
      invoiceNumber: 'INV-1',
      leaseId: 'lease-1',
      ownerId: 'owner-1',
      subtotal: 100,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-31'),
      currencyCode: 'ARS',
      companyId: 'company-1',
    } as any;
    invoicesRepository.findOne!.mockResolvedValue(draft);
    invoicesRepository.findOneOrFail!.mockResolvedValue({
      ...draft,
      owner: { companyId: 'company-1', user: { companyId: 'company-1' } },
      lease: {
        companyId: 'company-1',
        tenant: { companyId: 'company-1', user: { companyId: 'company-1' } },
        property: { companyId: 'company-1' },
      },
    });
    invoicesRepository.save!.mockImplementation(async (d) => d);
    jest
      .spyOn(service as any, 'createCommissionInvoice')
      .mockResolvedValue(undefined);

    const result = await service.issue('inv-1', 'company-1');

    expect(result.status).toBe(InvoiceStatus.PENDING);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(invoicesRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'inv-1', companyId: 'company-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      {
        accountId: 'acc-1',
        type: MovementType.CHARGE,
        amount: 120,
        referenceType: 'invoice',
        referenceId: 'inv-1',
        description: 'Factura INV-1',
        companyId: 'company-1',
      },
    );
  });

  it('aborts invoice issue when the account movement fails', async () => {
    invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-rollback',
      companyId: 'company-1',
      status: InvoiceStatus.DRAFT,
      tenantAccountId: 'acc-1',
      total: 120,
      invoiceNumber: 'INV-ROLLBACK',
    } as any);
    invoicesRepository.save!.mockImplementation(async (invoice) => invoice);
    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockRejectedValue(new Error('movement write failed'));
    const commissionSpy = jest.spyOn(service as any, 'createCommissionInvoice');

    await expect(service.issue('inv-rollback', 'company-1')).rejects.toThrow(
      'movement write failed',
    );
    expect(commissionSpy).not.toHaveBeenCalled();
  });

  it('findOne throws when invoice does not exist', async () => {
    invoicesRepository.findOne!.mockResolvedValue(null);
    await expect(
      service.findOne('missing', 'company-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(invoicesRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing', companyId: 'company-1' },
      }),
    );
  });

  it('findOneScoped applies visibility and throws when not found', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    invoicesRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await expect(
      service.findOneScoped('missing', {
        id: 'owner-1',
        companyId: 'company-1',
        role: UserRole.OWNER,
        email: 'owner@test.dev',
        phone: '123',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('owner.user_id = :scopeUserId'),
      expect.objectContaining({ scopeUserId: 'owner-1' }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'invoice.company_id = :companyId',
      { companyId: 'company-1' },
    );
  });

  it('findAll applies filters and tenant scope', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    invoicesRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll(
      {
        leaseId: 'lease-1',
        ownerId: 'owner-1',
        status: InvoiceStatus.PENDING,
        page: 2,
        limit: 5,
      },
      {
        id: 'tenant-user-1',
        companyId: 'company-1',
        role: UserRole.TENANT,
        email: 'tenant@test.dev',
        phone: '555',
      },
    );

    expect(qb.andWhere).toHaveBeenCalledWith('invoice.lease_id = :leaseId', {
      leaseId: 'lease-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('invoice.owner_id = :ownerId', {
      ownerId: 'owner-1',
    });
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('tenant.user_id = :scopeUserId'),
      expect.objectContaining({ scopeUserId: 'tenant-user-1' }),
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'invoice.company_id = :companyId',
      { companyId: 'company-1' },
    );
  });

  it('generateInvoiceNumber uses a company transaction lock and the database sequence', async () => {
    invoicesRepository.findOne!.mockResolvedValue({
      invoiceNumber: 'INV-202501-0009',
    } as any);

    const number = await service.generateInvoiceNumber('company-1', manager);
    expect(number).toMatch(/^INV-\d{6}-0010$/);
  });

  it('createCommissionInvoice skips when lease has no commission config', async () => {
    leasesRepository.findOne!.mockResolvedValue({
      id: 'lease-1',
      property: { companyId: 'company-1' },
      owner: { commissionRate: null },
    } as any);

    await (service as any).createCommissionInvoice({
      id: 'inv-1',
      leaseId: 'lease-1',
    });

    expect(_commissionRepository.create).not.toHaveBeenCalled();
  });

  it('createCommissionInvoice persists commission draft', async () => {
    leasesRepository.findOne!.mockResolvedValue({
      id: 'lease-1',
      owner: { commissionRate: 10 },
      property: { companyId: 'company-1' },
    } as any);
    _commissionRepository.findOne!.mockResolvedValue({
      invoiceNumber: 'COM-202501-0002',
    } as any);
    _commissionRepository.create!.mockImplementation((d) => d);
    _commissionRepository.save!.mockResolvedValue({ id: 'com-1' });

    await (service as any).createCommissionInvoice(
      {
        id: 'inv-1',
        leaseId: 'lease-1',
        ownerId: 'owner-1',
        subtotal: 1000,
        currencyCode: 'ARS',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        invoiceNumber: 'INV-1',
        companyId: 'company-1',
      } as any,
      manager,
    );

    expect(_commissionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        ownerId: 'owner-1',
        commissionAmount: 100,
        taxAmount: 21,
        totalAmount: 121,
        status: CommissionInvoiceStatus.DRAFT,
      }),
    );
  });

  it('cancel rejects paid invoices and reverts pending movement', async () => {
    invoicesRepository.findOne!.mockResolvedValueOnce({
      id: 'inv-paid',
      status: InvoiceStatus.PAID,
    } as any);

    await expect(
      service.cancel('inv-paid', 'company-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const pending = {
      id: 'inv-1',
      companyId: 'company-1',
      status: InvoiceStatus.PENDING,
      tenantAccountId: 'acc-1',
      total: 100,
      invoiceNumber: 'INV-1',
    } as any;
    invoicesRepository.findOne!.mockResolvedValueOnce(pending);
    invoicesRepository.save!.mockImplementation(async (d) => d);

    const result = await service.cancel('inv-1', 'company-1');
    expect(result.status).toBe(InvoiceStatus.CANCELLED);
    expect(tenantAccountsService.addMovementWithManager).toHaveBeenCalledWith(
      expect.anything(),
      {
        accountId: 'acc-1',
        type: MovementType.ADJUSTMENT,
        amount: -100,
        referenceType: 'invoice',
        referenceId: 'inv-1',
        description: 'Anulación factura INV-1',
        companyId: 'company-1',
      },
    );
  });

  it('does not persist cancellation when its reversal fails', async () => {
    invoicesRepository.findOne!.mockResolvedValue({
      id: 'inv-rollback',
      companyId: 'company-1',
      status: InvoiceStatus.PENDING,
      tenantAccountId: 'acc-1',
      total: 100,
      invoiceNumber: 'INV-ROLLBACK',
    } as any);
    (
      tenantAccountsService.addMovementWithManager as jest.Mock
    ).mockRejectedValue(new Error('reversal failed'));

    await expect(service.cancel('inv-rollback', 'company-1')).rejects.toThrow(
      'reversal failed',
    );
    expect(invoicesRepository.save).not.toHaveBeenCalled();
  });
});
