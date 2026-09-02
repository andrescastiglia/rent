import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmendmentsService } from './amendments.service';
import {
  LeaseAmendment,
  AmendmentStatus,
  AmendmentChangeType,
} from './entities/lease-amendment.entity';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AmendmentsService', () => {
  let service: AmendmentsService;
  let amendmentRepository: MockRepository<LeaseAmendment>;
  let leaseRepository: MockRepository<Lease>;
  let leaseQueryBuilder: Record<string, jest.Mock>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const mockLease: Partial<Lease> = {
    id: 'lease-1',
    status: LeaseStatus.ACTIVE,
  };

  const mockAmendment: Partial<LeaseAmendment> = {
    id: 'amendment-1',
    leaseId: 'lease-1',
    description: 'Rent increase',
    status: AmendmentStatus.DRAFT,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmendmentsService,
        {
          provide: getRepositoryToken(LeaseAmendment),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<AmendmentsService>(AmendmentsService);
    amendmentRepository = module.get(getRepositoryToken(LeaseAmendment));
    leaseRepository = module.get(getRepositoryToken(Lease));
    leaseQueryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(mockLease),
    };
    leaseRepository.createQueryBuilder!.mockReturnValue(leaseQueryBuilder);
  });

  const adminActor = {
    id: 'user-1',
    companyId: 'company-1',
    role: 'admin',
  } as any;

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an amendment for active lease', async () => {
      const createDto = {
        leaseId: 'lease-1',
        companyId: 'untrusted-company',
        effectiveDate: '2024-02-01',
        changeType: AmendmentChangeType.RENT_INCREASE,
        description: 'Rent increase',
        newValues: { rentAmount: 1600 },
      };

      amendmentRepository.create!.mockReturnValue(mockAmendment);
      amendmentRepository.save!.mockResolvedValue(mockAmendment);

      const result = await service.create(createDto, adminActor);

      expect(leaseQueryBuilder.andWhere).toHaveBeenCalledWith(
        'lease.company_id = :companyId',
        { companyId: 'company-1' },
      );
      expect(amendmentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          leaseId: createDto.leaseId,
          companyId: 'company-1',
          requestedBy: 'user-1',
          effectiveDate: createDto.effectiveDate,
          changeType: createDto.changeType,
          status: AmendmentStatus.DRAFT,
        }),
      );
      expect(result).toEqual(mockAmendment);
    });

    it('should throw NotFoundException when lease not found', async () => {
      const createDto = {
        leaseId: 'non-existent',
        companyId: 'company-1',
        effectiveDate: '2024-02-01',
        changeType: AmendmentChangeType.RENT_INCREASE,
        description: 'Test',
      };

      leaseQueryBuilder.getOne.mockResolvedValue(null);

      await expect(service.create(createDto, adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-active lease', async () => {
      const createDto = {
        leaseId: 'lease-1',
        companyId: 'company-1',
        effectiveDate: '2024-02-01',
        changeType: AmendmentChangeType.RENT_INCREASE,
        description: 'Test',
      };

      leaseQueryBuilder.getOne.mockResolvedValue({
        ...mockLease,
        status: LeaseStatus.DRAFT,
      });

      await expect(service.create(createDto, adminActor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByLease', () => {
    it('should return amendments for a lease', async () => {
      const amendments = [
        mockAmendment,
        { ...mockAmendment, id: 'amendment-2' },
      ];
      amendmentRepository.find!.mockResolvedValue(amendments);

      const result = await service.findByLease('lease-1', adminActor);

      expect(amendmentRepository.find).toHaveBeenCalledWith({
        where: { leaseId: 'lease-1', companyId: 'company-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(amendments);
    });
  });

  describe('findOne', () => {
    it('should return an amendment by id', async () => {
      amendmentRepository.findOne!.mockResolvedValue(mockAmendment);

      const result = await service.findOne('amendment-1', adminActor);

      expect(amendmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'amendment-1', companyId: 'company-1' },
        relations: ['lease'],
      });
      expect(result).toEqual(mockAmendment);
    });

    it('should throw NotFoundException when amendment not found', async () => {
      amendmentRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('999', adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approve', () => {
    it('should approve a pending_approval amendment', async () => {
      // First call is from findOne() method, second is from the actual save
      amendmentRepository.findOne!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.PENDING_APPROVAL,
      });
      amendmentRepository.save!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.APPROVED,
        approvedBy: 'user-1',
      });

      const result = await service.approve('amendment-1', adminActor);

      expect(result.status).toBe(AmendmentStatus.APPROVED);
      expect(result.approvedBy).toBe('user-1');
    });

    it('should throw BadRequestException when approving non-pending_approval amendment', async () => {
      amendmentRepository.findOne!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.APPROVED,
      });

      await expect(service.approve('amendment-1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending_approval amendment', async () => {
      // Mock for findOne() call inside reject()
      amendmentRepository.findOne!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.PENDING_APPROVAL,
      });
      amendmentRepository.save!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.REJECTED,
        approvedBy: 'user-1',
      });

      const result = await service.reject('amendment-1', adminActor);

      expect(result.status).toBe(AmendmentStatus.REJECTED);
    });

    it('should throw BadRequestException when rejecting non-pending_approval amendment', async () => {
      amendmentRepository.findOne!.mockResolvedValue({
        ...mockAmendment,
        status: AmendmentStatus.REJECTED,
      });

      await expect(service.reject('amendment-1', adminActor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
