import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service';
import { Property } from '../properties/entities/property.entity';
import { Lease } from '../leases/entities/lease.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { BillingJob } from '../payments/entities/billing-job.entity';
import { CommissionInvoice } from '../payments/entities/commission-invoice.entity';
import { InterestedActivity } from '../interested/entities/interested-activity.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import { OwnerActivity } from '../owners/entities/owner-activity.entity';
import { Owner } from '../owners/entities/owner.entity';

const makeQb = () => {
  const qb: any = {
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    clone: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
    getCount: jest.fn(),
  };
  qb.clone.mockReturnValue(qb);
  return qb;
};

const makeRepo = () => ({
  createQueryBuilder: jest.fn(),
  find: jest.fn(),
});

describe('DashboardService', () => {
  let service: DashboardService;
  const propertiesRepository = makeRepo();
  const leasesRepository = makeRepo();
  const usersRepository = makeRepo();
  const paymentsRepository = makeRepo();
  const invoicesRepository = makeRepo();
  const billingJobRepository = makeRepo();
  const commissionInvoiceRepository = makeRepo();
  const interestedActivityRepository = makeRepo();
  const interestedProfilesRepository = makeRepo();
  const ownerActivityRepository = makeRepo();
  const ownerRepository = makeRepo();
  const dataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Property),
          useValue: propertiesRepository,
        },
        { provide: getRepositoryToken(Lease), useValue: leasesRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Payment), useValue: paymentsRepository },
        { provide: getRepositoryToken(Invoice), useValue: invoicesRepository },
        {
          provide: getRepositoryToken(BillingJob),
          useValue: billingJobRepository,
        },
        {
          provide: getRepositoryToken(CommissionInvoice),
          useValue: commissionInvoiceRepository,
        },
        {
          provide: getRepositoryToken(InterestedActivity),
          useValue: interestedActivityRepository,
        },
        {
          provide: getRepositoryToken(InterestedProfile),
          useValue: interestedProfilesRepository,
        },
        {
          provide: getRepositoryToken(OwnerActivity),
          useValue: ownerActivityRepository,
        },
        { provide: getRepositoryToken(Owner), useValue: ownerRepository },
        {
          provide: getDataSourceToken(),
          useValue: dataSource as Partial<DataSource>,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('getStats computes dashboard totals for admin', async () => {
    const propertiesQb = makeQb();
    propertiesQb.getRawOne.mockResolvedValue({ total: '5' });
    propertiesRepository.createQueryBuilder.mockReturnValue(propertiesQb);

    const tenantsQb = makeQb();
    tenantsQb.getRawOne.mockResolvedValue({ total: '8' });
    const activeLeasesQb = makeQb();
    activeLeasesQb.getMany.mockResolvedValue([
      { monthlyRent: 1000, currency: 'USD' },
      { monthlyRent: 500, currency: 'USD' },
    ]);
    leasesRepository.createQueryBuilder
      .mockReturnValueOnce(tenantsQb)
      .mockReturnValueOnce(activeLeasesQb);

    const paymentsQb = makeQb();
    paymentsQb.getCount.mockResolvedValue(12);
    paymentsRepository.createQueryBuilder.mockReturnValue(paymentsQb);

    const invoicesQb = makeQb();
    invoicesQb.getCount.mockResolvedValue(7);
    invoicesRepository.createQueryBuilder.mockReturnValue(invoicesQb);

    const commissionsQb = makeQb();
    commissionsQb.getRawOne.mockResolvedValue({ total: '321.5' });
    commissionInvoiceRepository.createQueryBuilder.mockReturnValue(
      commissionsQb,
    );

    dataSource.query.mockResolvedValue([{ total: '99.5' }]);

    const result = await service.getStats('company-1', {
      id: 'u-admin',
      role: UserRole.ADMIN,
    });

    expect(result).toEqual({
      totalProperties: 5,
      totalTenants: 8,
      activeLeases: 2,
      monthlyIncome: 1500,
      monthlyExpenses: 99.5,
      currencyCode: 'USD',
      totalPayments: 12,
      totalInvoices: 7,
      monthlyCommissions: 321.5,
    });
  });

  it('getStats returns zero commission/expenses for tenant', async () => {
    const propertiesQb = makeQb();
    propertiesQb.getRawOne.mockResolvedValue({ total: '1' });
    propertiesRepository.createQueryBuilder.mockReturnValue(propertiesQb);

    const tenantsQb = makeQb();
    tenantsQb.getRawOne.mockResolvedValue({ total: '1' });
    const activeLeasesQb = makeQb();
    activeLeasesQb.getMany.mockResolvedValue([
      { monthlyRent: 700, currency: 'ARS' },
    ]);
    leasesRepository.createQueryBuilder
      .mockReturnValueOnce(tenantsQb)
      .mockReturnValueOnce(activeLeasesQb);

    const paymentsQb = makeQb();
    paymentsQb.getCount.mockResolvedValue(1);
    paymentsRepository.createQueryBuilder.mockReturnValue(paymentsQb);

    const invoicesQb = makeQb();
    invoicesQb.getCount.mockResolvedValue(1);
    invoicesRepository.createQueryBuilder.mockReturnValue(invoicesQb);

    const result = await service.getStats('company-1', {
      id: 'tenant-1',
      role: UserRole.TENANT,
      email: 'tenant@test.dev',
      phone: '123',
    });

    expect(result.monthlyCommissions).toBe(0);
    expect(result.monthlyExpenses).toBe(0);
  });

  it('getRecentActivity maps and sorts overdue/today rows with pending approvals', async () => {
    const interestedOverdueQb = makeQb();
    interestedOverdueQb.getRawMany.mockResolvedValue([
      {
        id: 'i-over',
        source_type: 'interested',
        person_type: 'interested',
        person_id: 'p1',
        person_name: 'Interested One',
        subject: 'Follow up',
        body: 'body',
        status: 'pending',
        due_at: '2025-01-01T00:00:00.000Z',
        completed_at: null,
        property_id: null,
        property_name: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
    ]);
    const interestedTodayQb = makeQb();
    interestedTodayQb.getRawMany.mockResolvedValue([
      {
        id: 'i-today',
        source_type: 'interested',
        person_type: 'interested',
        person_id: 'p2',
        person_name: 'Interested Two',
        subject: 'Today task',
        body: null,
        status: 'pending',
        due_at: '2030-01-01T12:00:00.000Z',
        completed_at: null,
        property_id: null,
        property_name: null,
        created_at: '2030-01-01T00:00:00.000Z',
        updated_at: '2030-01-01T00:00:00.000Z',
      },
    ]);
    interestedActivityRepository.createQueryBuilder
      .mockReturnValueOnce(interestedOverdueQb)
      .mockReturnValueOnce(interestedTodayQb);

    const ownerOverdueQb = makeQb();
    ownerOverdueQb.getRawMany.mockResolvedValue([]);
    const ownerTodayQb = makeQb();
    ownerTodayQb.getRawMany.mockResolvedValue([]);
    ownerActivityRepository.createQueryBuilder
      .mockReturnValueOnce(ownerOverdueQb)
      .mockReturnValueOnce(ownerTodayQb);

    usersRepository.find.mockResolvedValue([
      {
        id: 'u-pending',
        role: UserRole.OWNER,
        email: 'pending@test.dev',
        firstName: 'Pending',
        lastName: 'Owner',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    const result = await service.getRecentActivity(
      'company-1',
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
      },
      13,
    );

    expect(result.overdue.length).toBeGreaterThan(0);
    expect(result.total).toBe(result.overdue.length + result.today.length);
  });

  it('getReportJobs paginates and normalizes report types', async () => {
    const query = makeQb();
    query.getCount.mockResolvedValue(3);
    const cloneQb = makeQb();
    cloneQb.getRawMany.mockResolvedValue([
      {
        id: 'job-1',
        status: 'completed',
        records_total: '10',
        records_processed: '10',
        records_failed: '0',
        dry_run: false,
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:05:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        error_message: null,
        error_log: null,
        owner_id: 'o1',
        owner_name: 'Owner 1',
        report_type: 'monthly',
        report_month: '2026-01',
      },
      {
        id: 'job-2',
        status: 'failed',
        records_total: '7',
        records_processed: '6',
        records_failed: '1',
        dry_run: true,
        started_at: null,
        completed_at: null,
        created_at: '2026-01-02T00:00:00.000Z',
        error_message: 'oops',
        error_log: [{ code: 'E' }],
        owner_id: 'o1',
        owner_name: 'Owner 1',
        report_type: 'settlement',
        report_month: null,
      },
      {
        id: 'job-ignored',
        status: 'completed',
        records_total: '1',
        records_processed: '1',
        records_failed: '0',
        dry_run: false,
        started_at: null,
        completed_at: null,
        created_at: '2026-01-03T00:00:00.000Z',
        error_message: null,
        error_log: [],
        owner_id: 'o1',
        owner_name: 'Owner 1',
        report_type: 'unknown',
        report_month: null,
      },
    ]);
    query.clone.mockReturnValue(cloneQb);
    billingJobRepository.createQueryBuilder.mockReturnValue(query);

    const result = await service.getReportJobs(
      'company-1',
      { id: 'owner-user', role: UserRole.OWNER, email: 'owner@test.dev' },
      Number.NaN,
      1000,
    );

    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].reportType).toBe('monthly_summary');
    expect(result.data[1].reportType).toBe('settlement');
  });
});
