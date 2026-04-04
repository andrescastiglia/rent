import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantsService } from './tenants.service';
import { User, UserRole } from '../users/entities/user.entity';
import {
  Lease,
  ContractType,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { Tenant } from './entities/tenant.entity';
import { TenantActivity } from './entities/tenant-activity.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { TenantAccount } from '../payments/entities/tenant-account.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantActivityStatus } from './entities/tenant-activity.entity';

jest.mock('bcrypt');

describe('TenantsService', () => {
  let service: TenantsService;
  let _tenantRepository: MockRepository<Tenant>;
  let _tenantActivityRepository: MockRepository<TenantActivity>;
  let userRepository: MockRepository<User>;
  let leaseRepository: MockRepository<Lease>;
  let invoiceRepository: MockRepository<Invoice>;
  let tenantAccountRepository: MockRepository<TenantAccount>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockQueryBuilder = (): any => {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn(),
    };
  };

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
  });

  const mockUser: Partial<User> = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'tenant@example.com',
    firstName: 'John',
    lastName: 'Tenant',
    role: UserRole.TENANT,
    isActive: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(Tenant),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TenantActivity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(TenantAccount),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    _tenantRepository = module.get(getRepositoryToken(Tenant));
    _tenantActivityRepository = module.get(getRepositoryToken(TenantActivity));
    userRepository = module.get(getRepositoryToken(User));
    leaseRepository = module.get(getRepositoryToken(Lease));
    invoiceRepository = module.get(getRepositoryToken(Invoice));
    tenantAccountRepository = module.get(getRepositoryToken(TenantAccount));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      companyId: 'test-company-id',
      email: 'tenant@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Tenant',
      phone: '+123456789',
      dni: '12345678',
      emergencyContact: 'Emergency Contact',
      emergencyPhone: '+987654321',
    };

    beforeEach(() => {
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
    });

    it('should create a tenant', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getOne.mockResolvedValue(null);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);
      userRepository.findOne!.mockResolvedValue(null);
      userRepository.create!.mockReturnValue(mockUser);
      userRepository.save!.mockResolvedValue(mockUser);
      userRepository.query!.mockResolvedValue([]);

      const result = await service.create(createDto);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: createDto.email,
          firstName: createDto.firstName,
          lastName: createDto.lastName,
          role: UserRole.TENANT,
        }),
      );
      expect(userRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        expect.arrayContaining([
          mockUser.id,
          createDto.companyId,
          createDto.dni,
        ]),
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException when DNI already exists', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getOne.mockResolvedValue(mockUser);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when email already exists', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getOne.mockResolvedValue(null);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);
      userRepository.findOne!.mockResolvedValue(mockUser);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should hash password before saving', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getOne.mockResolvedValue(null);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);
      userRepository.findOne!.mockResolvedValue(null);
      userRepository.create!.mockReturnValue(mockUser);
      userRepository.save!.mockResolvedValue(mockUser);
      userRepository.query!.mockResolvedValue([]);

      await service.create(createDto);

      expect(bcrypt.genSalt).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith(createDto.password, 'salt');
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: 'hashedPassword',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tenants', async () => {
      const filters = { page: 1, limit: 10 };
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockUser], 1]);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filters);

      expect(result).toEqual({
        data: [mockUser],
        total: 1,
        page: 1,
        limit: 10,
      });
    });

    it('should filter tenants by name', async () => {
      const filters = { name: 'John', page: 1, limit: 10 };
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockUser], 1]);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("coalesce(user.first_name, '')"),
        { name: '%John%' },
      );
    });

    it('should support searching by last name', async () => {
      const filters = { name: 'Doe', page: 1, limit: 10 };
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockUser], 1]);

      userRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining("coalesce(user.first_name, '')"),
        { name: '%Doe%' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a tenant by id', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.findOne!.mockResolvedValue({ id: 'lease-1' });
      userRepository.findOne!.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-1', role: UserRole.TENANT },
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      userRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when tenant has no rental lease', async () => {
      userRepository.findOne!.mockResolvedValue(mockUser);
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update tenant information', async () => {
      const updateDto = { firstName: 'Jane', phone: '+111111111' };
      userRepository.findOne!.mockResolvedValue(mockUser);
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.findOne!.mockResolvedValue({ id: 'lease-1' });
      userRepository.save!.mockResolvedValue({ ...mockUser, ...updateDto });
      userRepository.query!.mockResolvedValue([]);

      const result = await service.update('user-1', updateDto);

      expect(userRepository.save).toHaveBeenCalled();
      expect(result.firstName).toBe('Jane');
    });

    it('should update tenant-specific fields via raw query', async () => {
      const updateDto = { dni: '87654321' };
      userRepository.findOne!.mockResolvedValue(mockUser);
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.findOne!.mockResolvedValue({ id: 'lease-1' });
      userRepository.save!.mockResolvedValue(mockUser);
      userRepository.query!.mockResolvedValue([]);

      await service.update('user-1', updateDto);

      expect(userRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants'),
        expect.any(Array),
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a tenant', async () => {
      userRepository.findOne!.mockResolvedValue(mockUser);
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.findOne!.mockResolvedValue({ id: 'lease-1' });
      userRepository.softDelete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.remove('user-1');

      expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getLeaseHistory', () => {
    it('should return lease history for tenant user id', async () => {
      const mockLeases = [{ id: 'lease-1', tenantId: 'tenant-1' }];
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      leaseRepository.find!.mockResolvedValue(mockLeases);

      const result = await service.getLeaseHistory('user-1');

      expect(leaseRepository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          contractType: 'rental',
        }),
        relations: ['property'],
        order: { startDate: 'DESC' },
      });
      expect(result).toEqual(mockLeases);
    });

    it('should throw when tenant user id is not found', async () => {
      _tenantRepository.findOne!.mockResolvedValue(null);

      await expect(service.getLeaseHistory('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listActivities', () => {
    it('returns activities for a tenant', async () => {
      const activities = [{ id: 'act-1', subject: 'Call' }];
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.find!.mockResolvedValue(activities);

      const result = await service.listActivities('user-1', 'company-1');

      expect(result).toEqual(activities);
      expect(_tenantActivityRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            companyId: 'company-1',
          }),
        }),
      );
    });

    it('throws NotFoundException when tenant not found', async () => {
      _tenantRepository.findOne!.mockResolvedValue(null);
      await expect(
        service.listActivities('missing', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createActivity', () => {
    it('creates activity with auto completedAt when status is completed', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.create!.mockReturnValue({
        companyId: 'company-1',
        tenantId: 'tenant-1',
        type: 'call',
        status: TenantActivityStatus.COMPLETED,
        subject: 'Follow up',
        completedAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      const result = await service.createActivity(
        'user-1',
        {
          type: 'call',
          status: TenantActivityStatus.COMPLETED,
          subject: 'Follow up',
        } as any,
        { id: 'admin-1', companyId: 'company-1' } as any,
      );

      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('creates activity with explicit dueAt and completedAt', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.create!.mockReturnValue({
        companyId: 'company-1',
        tenantId: 'tenant-1',
        type: 'task',
        status: TenantActivityStatus.PENDING,
        subject: 'Review docs',
        dueAt: new Date('2026-04-01'),
        completedAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      await service.createActivity(
        'user-1',
        {
          type: 'task',
          subject: 'Review docs',
          dueAt: '2026-04-01',
        } as any,
        { id: 'admin-1', companyId: 'company-1' } as any,
      );

      expect(_tenantActivityRepository.save).toHaveBeenCalled();
    });
  });

  describe('updateActivity', () => {
    it('updates activity fields', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.findOne!.mockResolvedValue({
        id: 'act-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        subject: 'Old',
        status: TenantActivityStatus.PENDING,
        completedAt: null,
        dueAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      const result = await service.updateActivity(
        'user-1',
        'act-1',
        { subject: 'Updated', dueAt: '2026-05-01' } as any,
        'company-1',
      );

      expect(result.subject).toBe('Updated');
    });

    it('throws NotFoundException when activity not found', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.updateActivity('user-1', 'missing', {} as any, 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets completedAt when status changes to completed', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.findOne!.mockResolvedValue({
        id: 'act-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        subject: 'Task',
        status: TenantActivityStatus.PENDING,
        completedAt: null,
        dueAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      const result = await service.updateActivity(
        'user-1',
        'act-1',
        { status: TenantActivityStatus.COMPLETED } as any,
        'company-1',
      );

      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('clears completedAt when explicitly set to null', async () => {
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.findOne!.mockResolvedValue({
        id: 'act-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        subject: 'Task',
        status: TenantActivityStatus.COMPLETED,
        completedAt: new Date('2026-01-01'),
        dueAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      const result = await service.updateActivity(
        'user-1',
        'act-1',
        { completedAt: null } as any,
        'company-1',
      );

      expect(result.completedAt).toBeNull();
    });

    it('preserves completedAt when not specified in dto', async () => {
      const existingDate = new Date('2026-01-15');
      _tenantRepository.findOne!.mockResolvedValue({
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
      _tenantActivityRepository.findOne!.mockResolvedValue({
        id: 'act-1',
        tenantId: 'tenant-1',
        companyId: 'company-1',
        subject: 'Task',
        status: TenantActivityStatus.COMPLETED,
        completedAt: existingDate,
        dueAt: null,
      });
      _tenantActivityRepository.save!.mockImplementation((e: any) => e);

      const result = await service.updateActivity(
        'user-1',
        'act-1',
        { subject: 'Renamed' } as any,
        'company-1',
      );

      expect(result.completedAt).toEqual(existingDate);
    });
  });

  describe('findByUserId', () => {
    it('returns the tenant for the given user and company', async () => {
      const mockTenant = {
        id: 'tenant-1',
        userId: 'user-1',
        companyId: 'company-1',
      };
      _tenantRepository.findOne!.mockResolvedValue(mockTenant);

      const result = await service.findByUserId('user-1', 'company-1');

      expect(result).toEqual(mockTenant);
      expect(_tenantRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          companyId: 'company-1',
          deletedAt: expect.anything(),
        },
      });
    });

    it('throws NotFoundException when tenant not found', async () => {
      _tenantRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.findByUserId('user-99', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTenantSummary', () => {
    const mockTenant = {
      id: 'tenant-1',
      userId: 'user-1',
      companyId: 'company-1',
    };
    const mockActiveLease = {
      id: 'lease-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      contractType: ContractType.RENTAL,
      status: LeaseStatus.ACTIVE,
    };

    it('returns summary with active lease, balance and pending invoices', async () => {
      _tenantRepository.findOne!.mockResolvedValue(mockTenant);
      leaseRepository.findOne!.mockResolvedValue(mockActiveLease);
      tenantAccountRepository.findOne!.mockResolvedValue({
        id: 'account-1',
        leaseId: 'lease-1',
        balance: '-500.00',
        currencyCode: 'ARS',
      });
      invoiceRepository.find!.mockResolvedValue([
        {
          id: 'inv-1',
          dueDate: new Date('2025-02-10'),
          status: InvoiceStatus.PENDING,
        },
        {
          id: 'inv-2',
          dueDate: new Date('2025-03-10'),
          status: InvoiceStatus.OVERDUE,
        },
      ]);

      const summary = await service.getTenantSummary('user-1', 'company-1');

      expect(summary.tenant).toEqual(mockTenant);
      expect(summary.activeLease).toEqual(mockActiveLease);
      expect(summary.currentBalance).toBe(-500);
      expect(summary.currencyCode).toBe('ARS');
      expect(summary.pendingInvoicesCount).toBe(2);
      expect(summary.nextPaymentDueDate).toEqual(new Date('2025-02-10'));
    });

    it('returns summary with zeroed values when no active lease', async () => {
      _tenantRepository.findOne!.mockResolvedValue(mockTenant);
      leaseRepository.findOne!.mockResolvedValue(null);

      const summary = await service.getTenantSummary('user-1', 'company-1');

      expect(summary.activeLease).toBeNull();
      expect(summary.currentBalance).toBe(0);
      expect(summary.pendingInvoicesCount).toBe(0);
      expect(summary.nextPaymentDueDate).toBeNull();
    });

    it('throws NotFoundException when tenant not found', async () => {
      _tenantRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.getTenantSummary('user-99', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
