import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import {
  InflationIndex,
  InflationIndexType as IndexTypeEntity,
} from './entities/inflation-index.entity';
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

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
    tenantAccountsService = {
      findByLease: jest.fn(),
      calculateLateFee: jest.fn(),
      addMovement: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
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
      ],
    }).compile();

    service = module.get(InvoicesService);
    invoicesRepository = module.get(getRepositoryToken(Invoice));
    _commissionRepository = module.get(getRepositoryToken(CommissionInvoice));
    leasesRepository = module.get(getRepositoryToken(Lease));
    inflationIndexRepository = module.get(getRepositoryToken(InflationIndex));
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

    await service.generateForLease('lease-1', { applyLateFee: true });

    expect(tenantAccountsService.calculateLateFee).toHaveBeenCalledWith(
      'acc-1',
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
      id: 'acc-1',
    });
    invoicesRepository.create!.mockImplementation((data) => data);
    invoicesRepository.save!.mockImplementation(async (data) => ({
      id: 'inv-2',
      ...data,
    }));
    leasesRepository.save!.mockResolvedValue(lease);

    await service.generateForLease('lease-2', { applyLateFee: false });

    const created = invoicesRepository.create!.mock.calls[0][0];
    expect(new Date(created.periodStart).toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    );
    expect(new Date(created.periodEnd).getUTCDate()).toBe(31);
    expect(new Date(created.dueDate).getDate()).toBe(5);
  });

  it('should use IPC index for inflation adjustments', async () => {
    const lease = {
      id: 'lease-3',
      monthlyRent: 1000,
      adjustmentType: AdjustmentType.INFLATION_INDEX,
      inflationIndexType: InflationIndexType.IPC,
      adjustmentFrequencyMonths: 12,
      nextAdjustmentDate: new Date('2024-01-01T00:00:00Z'),
    } as unknown as Lease;

    inflationIndexRepository.findOne!.mockResolvedValue({
      variationMonthly: 10,
    } as any);
    leasesRepository.save!.mockResolvedValue(lease);

    const result = await (service as any).applyAdjustmentIfNeeded(
      lease,
      new Date('2025-01-01T00:00:00Z'),
      true,
    );

    expect(inflationIndexRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { indexType: IndexTypeEntity.IPC },
      }),
    );
    expect(result).toBe(1100);
  });

  it('create throws when lease does not exist', async () => {
    leasesRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.create({ leaseId: 'missing', subtotal: 10 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create throws when owner is missing on lease', async () => {
    leasesRepository.findOne!.mockResolvedValue({
      id: 'lease-1',
      property: null,
      ownerId: null,
    } as any);
    (tenantAccountsService.findByLease as jest.Mock).mockResolvedValue({
      id: 'acc-1',
    });

    await expect(
      service.create({
        leaseId: 'lease-1',
        subtotal: 100,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        dueDate: new Date('2025-02-10'),
      } as any),
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
      id: 'acc-1',
    });
    jest
      .spyOn(service, 'generateInvoiceNumber')
      .mockResolvedValue('INV-202501-0001');
    invoicesRepository.create!.mockImplementation((d) => d);
    invoicesRepository.save!.mockImplementation(async (d) => d);

    const result = await service.create({
      leaseId: 'lease-1',
      subtotal: 100,
      lateFee: 10,
      adjustments: -5,
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-31'),
      dueDate: new Date('2025-02-10'),
      notes: 'note',
    } as any);

    expect(result.total).toBe(105);
    expect(result.status).toBe(InvoiceStatus.DRAFT);
  });

  it('issue rejects non-draft invoices', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'inv-1',
      status: InvoiceStatus.PAID,
    } as any);

    await expect(service.issue('inv-1')).rejects.toBeInstanceOf(
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
    } as any;
    jest.spyOn(service, 'findOne').mockResolvedValue(draft);
    invoicesRepository.save!.mockImplementation(async (d) => d);
    jest
      .spyOn(service as any, 'createCommissionInvoice')
      .mockResolvedValue(undefined);

    const result = await service.issue('inv-1');

    expect(result.status).toBe(InvoiceStatus.PENDING);
    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-1',
      MovementType.CHARGE,
      120,
      'invoice',
      'inv-1',
      'Factura INV-1',
    );
  });

  it('attachPdf updates invoice url', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'inv-1',
      pdfUrl: null,
    } as any);
    invoicesRepository.save!.mockImplementation(async (d) => d);

    const result = await service.attachPdf('inv-1', 'db://document/1');
    expect(result.pdfUrl).toBe('db://document/1');
  });

  it('findOne throws when invoice does not exist', async () => {
    invoicesRepository.findOne!.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
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
        role: UserRole.OWNER,
        email: 'owner@test.dev',
        phone: '123',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('owner.user_id = :scopeUserId'),
      expect.objectContaining({ scopeUserId: 'owner-1' }),
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
  });

  it('generateInvoiceNumber increments sequence from last invoice', async () => {
    invoicesRepository.findOne!.mockResolvedValue({
      invoiceNumber: 'INV-202501-0009',
    } as any);

    const number = await service.generateInvoiceNumber('owner-1');
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

    await (service as any).createCommissionInvoice({
      id: 'inv-1',
      leaseId: 'lease-1',
      ownerId: 'owner-1',
      subtotal: 1000,
      currencyCode: 'ARS',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-31'),
      invoiceNumber: 'INV-1',
    } as any);

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
    jest.spyOn(service, 'findOne').mockResolvedValueOnce({
      id: 'inv-paid',
      status: InvoiceStatus.PAID,
    } as any);

    await expect(service.cancel('inv-paid')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const pending = {
      id: 'inv-1',
      status: InvoiceStatus.PENDING,
      tenantAccountId: 'acc-1',
      total: 100,
      invoiceNumber: 'INV-1',
    } as any;
    jest.spyOn(service, 'findOne').mockResolvedValueOnce(pending);
    invoicesRepository.save!.mockImplementation(async (d) => d);

    const result = await service.cancel('inv-1');
    expect(result.status).toBe(InvoiceStatus.CANCELLED);
    expect(tenantAccountsService.addMovement).toHaveBeenCalledWith(
      'acc-1',
      MovementType.ADJUSTMENT,
      -100,
      'invoice',
      'inv-1',
      'Anulación factura INV-1',
    );
  });
});
