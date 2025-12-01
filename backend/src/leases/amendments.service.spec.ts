import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AmendmentsService } from './amendments.service';
import { LeaseAmendment, AmendmentStatus } from './entities/lease-amendment.entity';
import { Lease, LeaseStatus } from './entities/lease.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AmendmentsService', () => {
    let service: AmendmentsService;
    let amendmentRepository: MockRepository<LeaseAmendment>;
    let leaseRepository: MockRepository<Lease>;

    type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

    const createMockRepository = (): MockRepository => ({
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
    });

    const mockLease: Partial<Lease> = {
        id: 'lease-1',
        status: LeaseStatus.ACTIVE,
    };

    const mockAmendment: Partial<LeaseAmendment> = {
        id: 'amendment-1',
        leaseId: 'lease-1',
        description: 'Rent increase',
        status: AmendmentStatus.PENDING,
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
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('create', () => {
        it('should create an amendment for active lease', async () => {
            const createDto = {
                leaseId: 'lease-1',
                description: 'Rent increase',
                changes: { rentAmount: 1600 },
            };

            leaseRepository.findOne.mockResolvedValue(mockLease);
            amendmentRepository.create.mockReturnValue(mockAmendment);
            amendmentRepository.save.mockResolvedValue(mockAmendment);

            const result = await service.create(createDto, 'user-1');

            expect(leaseRepository.findOne).toHaveBeenCalled();
            expect(amendmentRepository.create).toHaveBeenCalledWith({
                ...createDto,
                status: AmendmentStatus.PENDING,
            });
            expect(result).toEqual(mockAmendment);
        });

        it('should throw NotFoundException when lease not found', async () => {
            const createDto = {
                leaseId: 'non-existent',
                description: 'Test',
                changes: {},
            };

            leaseRepository.findOne.mockResolvedValue(null);

            await expect(service.create(createDto, 'user-1')).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException for non-active lease', async () => {
            const createDto = {
                leaseId: 'lease-1',
                description: 'Test',
                changes: {},
            };

            leaseRepository.findOne.mockResolvedValue({ ...mockLease, status: LeaseStatus.DRAFT });

            await expect(service.create(createDto, 'user-1')).rejects.toThrow(BadRequestException);
        });
    });

    describe('findByLease', () => {
        it('should return amendments for a lease', async () => {
            const amendments = [mockAmendment, { ...mockAmendment, id: 'amendment-2' }];
            amendmentRepository.find.mockResolvedValue(amendments);

            const result = await service.findByLease('lease-1');

            expect(amendmentRepository.find).toHaveBeenCalledWith({
                where: { leaseId: 'lease-1' },
                order: { createdAt: 'DESC' },
            });
            expect(result).toEqual(amendments);
        });
    });

    describe('findOne', () => {
        it('should return an amendment by id', async () => {
            amendmentRepository.findOne.mockResolvedValue(mockAmendment);

            const result = await service.findOne('amendment-1');

            expect(result).toEqual(mockAmendment);
        });

        it('should throw NotFoundException when amendment not found', async () => {
            amendmentRepository.findOne.mockResolvedValue(null);

            await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
        });
    });

    describe('approve', () => {
        it('should approve a pending amendment', async () => {
            amendmentRepository.findOne.mockResolvedValue(mockAmendment);
            amendmentRepository.save.mockResolvedValue({
                ...mockAmendment,
                status: AmendmentStatus.APPROVED,
                approvedBy: 'user-1',
            });

            const result = await service.approve('amendment-1', 'user-1');

            expect(result.status).toBe(AmendmentStatus.APPROVED);
            expect(result.approvedBy).toBe('user-1');
        });

        it('should throw BadRequestException when approving non-pending amendment', async () => {
            amendmentRepository.findOne.mockResolvedValue({
                ...mockAmendment,
                status: AmendmentStatus.APPROVED,
            });

            await expect(service.approve('amendment-1', 'user-1')).rejects.toThrow(BadRequestException);
        });
    });

    describe('reject', () => {
        it('should reject a pending amendment', async () => {
            amendmentRepository.findOne.mockResolvedValue(mockAmendment);
            amendmentRepository.save.mockResolvedValue({
                ...mockAmendment,
                status: AmendmentStatus.REJECTED,
                approvedBy: 'user-1',
            });

            const result = await service.reject('amendment-1', 'user-1');

            expect(result.status).toBe(AmendmentStatus.REJECTED);
        });

        it('should throw BadRequestException when rejecting non-pending amendment', async () => {
            amendmentRepository.findOne.mockResolvedValue({
                ...mockAmendment,
                status: AmendmentStatus.REJECTED,
            });

            await expect(service.reject('amendment-1', 'user-1')).rejects.toThrow(BadRequestException);
        });
    });
});
