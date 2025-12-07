import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeasesService } from './leases.service';
import { Lease, LeaseStatus, PaymentFrequency } from './entities/lease.entity';
import { Unit, UnitStatus } from '../properties/entities/unit.entity';
import { PdfService } from './pdf.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('LeasesService', () => {
  let service: LeasesService;
  let leaseRepository: MockRepository<Lease>;
  let unitRepository: MockRepository<Unit>;
  let pdfService: jest.Mocked<PdfService>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    })),
  });

  const mockLease: Partial<Lease> = {
    id: 'lease-1',
    unitId: 'unit-1',
    tenantId: 'tenant-1',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    monthlyRent: 1500,
    securityDeposit: 3000,
    status: LeaseStatus.DRAFT,
    paymentFrequency: PaymentFrequency.MONTHLY,
  };

  const mockUnit: Partial<Unit> = {
    id: 'unit-1',
    propertyId: 'property-1',
    unitNumber: '101',
    status: UnitStatus.AVAILABLE,
  };

  beforeEach(async () => {
    pdfService = {
      generateContract: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeasesService,
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: createMockRepository(),
        },
        {
          provide: PdfService,
          useValue: pdfService,
        },
      ],
    }).compile();

    service = module.get<LeasesService>(LeasesService);
    leaseRepository = module.get(getRepositoryToken(Lease));
    unitRepository = module.get(getRepositoryToken(Unit));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a lease in draft status', async () => {
      const createDto = {
        unitId: 'unit-1',
        tenantId: 'tenant-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        monthlyRent: 1500,
        securityDeposit: 3000,
      };

      unitRepository.findOne!.mockResolvedValue(mockUnit);
      leaseRepository.create!.mockReturnValue(mockLease);
      leaseRepository.save!.mockResolvedValue(mockLease);

      const result = await service.create(createDto);

      expect(unitRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'unit-1' },
      });
      expect(leaseRepository.create).toHaveBeenCalledWith({
        ...createDto,
        status: LeaseStatus.DRAFT,
      });
      expect(result).toEqual(mockLease);
    });

    it('should throw BadRequestException when end date is before start date', async () => {
      const createDto = {
        unitId: 'unit-1',
        tenantId: 'tenant-1',
        startDate: '2024-12-31',
        endDate: '2024-01-01',
        monthlyRent: 1500,
        securityDeposit: 3000,
      };

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when unit does not exist', async () => {
      const createDto = {
        unitId: 'non-existent',
        tenantId: 'tenant-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        monthlyRent: 1500,
        securityDeposit: 3000,
      };

      unitRepository.findOne!.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated leases', async () => {
      const filters = { page: 1, limit: 10 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockLease], 1]),
      };

      leaseRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filters);

      expect(result).toEqual({
        data: [mockLease],
        total: 1,
        page: 1,
        limit: 10,
      });
    });

    it('should filter leases by status', async () => {
      const filters = { status: LeaseStatus.ACTIVE, page: 1, limit: 10 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockLease], 1]),
      };

      leaseRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'lease.status = :status',
        { status: LeaseStatus.ACTIVE },
      );
    });
  });

  describe('findOne', () => {
    it('should return a lease by id', async () => {
      leaseRepository.findOne!.mockResolvedValue(mockLease);

      const result = await service.findOne('lease-1');

      expect(result).toEqual(mockLease);
    });

    it('should throw NotFoundException when lease not found', async () => {
      leaseRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a draft lease', async () => {
      const updateDto = { monthlyRent: 1600 };
      leaseRepository.findOne!.mockResolvedValue(mockLease);
      leaseRepository.save!.mockResolvedValue({ ...mockLease, ...updateDto });

      const result = await service.update('lease-1', updateDto);

      expect(result.monthlyRent).toBe(1600);
    });

    it('should throw BadRequestException when updating non-draft lease', async () => {
      const updateDto = { monthlyRent: 1600 };
      leaseRepository.findOne!.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.ACTIVE,
      });

      await expect(service.update('lease-1', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('activate', () => {
    it('should activate a draft lease', async () => {
      leaseRepository
        .findOne!.mockResolvedValueOnce(mockLease)
        .mockResolvedValueOnce(null); // No existing active lease
      leaseRepository.save!.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.ACTIVE,
      });
      unitRepository.update!.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      pdfService.generateContract.mockResolvedValue({} as any);

      const result = await service.activate('lease-1', 'user-1');

      expect(unitRepository.update).toHaveBeenCalledWith('unit-1', {
        status: UnitStatus.OCCUPIED,
      });
      expect(result.status).toBe(LeaseStatus.ACTIVE);
    });

    it('should throw ConflictException when unit has active lease', async () => {
      const draftLease = { ...mockLease, status: LeaseStatus.DRAFT };
      const activeLease = {
        ...mockLease,
        id: 'lease-2',
        status: LeaseStatus.ACTIVE,
      };
      leaseRepository
        .findOne!.mockResolvedValueOnce(draftLease) // First call in activate() via findOne()
        .mockResolvedValueOnce(activeLease); // Second call checking for existing active lease

      await expect(service.activate('lease-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('terminate', () => {
    it('should terminate an active lease', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE };
      leaseRepository.findOne!.mockResolvedValue(activeLease);
      leaseRepository.save!.mockResolvedValue({
        ...activeLease,
        status: LeaseStatus.TERMINATED,
      });
      unitRepository.update!.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      const result = await service.terminate('lease-1', 'Early termination');

      expect(unitRepository.update).toHaveBeenCalledWith('unit-1', {
        status: UnitStatus.AVAILABLE,
      });
      expect(result.status).toBe(LeaseStatus.TERMINATED);
    });

    it('should throw BadRequestException when terminating non-active lease', async () => {
      const draftLease = { ...mockLease, status: LeaseStatus.DRAFT };
      leaseRepository.findOne!.mockResolvedValue(draftLease);

      await expect(service.terminate('lease-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('renew', () => {
    it('should renew an active lease', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE };
      const newLease = {
        ...mockLease,
        id: 'lease-2',
        status: LeaseStatus.DRAFT,
      };

      leaseRepository.findOne!.mockResolvedValue(activeLease);
      leaseRepository
        .save!.mockResolvedValueOnce({
          ...activeLease,
          status: LeaseStatus.RENEWED,
        })
        .mockResolvedValueOnce(newLease);
      leaseRepository.create!.mockReturnValue(newLease);

      const result = await service.renew('lease-1', { endDate: '2025-12-31' });

      expect(result.status).toBe(LeaseStatus.DRAFT);
      expect(leaseRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('remove', () => {
    it('should soft delete a non-active lease', async () => {
      const draftLease = { ...mockLease, status: LeaseStatus.DRAFT };
      leaseRepository.findOne!.mockResolvedValue(draftLease);
      leaseRepository.softDelete!.mockResolvedValue({ affected: 1, raw: [] });

      await service.remove('lease-1');

      expect(leaseRepository.softDelete).toHaveBeenCalledWith('lease-1');
    });

    it('should throw BadRequestException when deleting active lease', async () => {
      const activeLease = { ...mockLease, status: LeaseStatus.ACTIVE };
      leaseRepository.findOne!.mockResolvedValue(activeLease);

      await expect(service.remove('lease-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
