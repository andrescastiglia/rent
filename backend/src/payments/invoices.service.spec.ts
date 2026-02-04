import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { CommissionInvoice } from './entities/commission-invoice.entity';
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

  it('should use Casa Propia index for inflation adjustments', async () => {
    const lease = {
      id: 'lease-3',
      monthlyRent: 1000,
      adjustmentType: AdjustmentType.INFLATION_INDEX,
      inflationIndexType: InflationIndexType.CASA_PROPIA,
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
        where: { indexType: IndexTypeEntity.CASA_PROPIA },
      }),
    );
    expect(result).toBe(1100);
  });
});
