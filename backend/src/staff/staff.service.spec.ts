import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';
import { Staff, StaffSpecialization } from './entities/staff.entity';
import { User, UserRole } from '../users/entities/user.entity';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockQb = () => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
});

const createMockRepository = () => {
  const qb = createMockQb();
  const repo: MockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  return repo;
};

const mockStaff = (overrides: Partial<Staff> = {}): Staff =>
  ({
    id: 'staff-uuid-1',
    userId: 'user-uuid-1',
    companyId: 'company-uuid-1',
    specialization: StaffSpecialization.MAINTENANCE,
    hourlyRate: 50,
    currency: 'ARS',
    availabilitySchedule: {},
    serviceAreas: [],
    certifications: [],
    notes: null,
    rating: null,
    totalJobs: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    user: {
      id: 'user-uuid-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: null,
      role: UserRole.STAFF,
      isActive: true,
    } as User,
    ...overrides,
  }) as Staff;

describe('StaffService', () => {
  let service: StaffService;
  let staffRepository: MockRepository<Staff>;
  let usersRepository: MockRepository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffService,
        {
          provide: getRepositoryToken(Staff),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get(StaffService);
    staffRepository = module.get(getRepositoryToken(Staff));
    usersRepository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns list of staff', async () => {
      const staff = [mockStaff()];
      const qb = staffRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(staff);

      const result = await service.findAll('company-uuid-1', {});

      expect(result).toEqual(staff);
    });

    it('applies specialization filter', async () => {
      const qb = staffRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll('company-uuid-1', {
        specialization: StaffSpecialization.CLEANING,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'staff.specialization = :specialization',
        { specialization: StaffSpecialization.CLEANING },
      );
    });

    it('applies search filter', async () => {
      const qb = staffRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll('company-uuid-1', { search: 'John' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('LOWER'),
        expect.objectContaining({ search: '%john%' }),
      );
    });
  });

  describe('findOne', () => {
    it('returns staff when found', async () => {
      const staff = mockStaff();
      staffRepository.findOne!.mockResolvedValue(staff);

      const result = await service.findOne('staff-uuid-1', 'company-uuid-1');

      expect(result).toEqual(staff);
    });

    it('throws NotFoundException when not found', async () => {
      staffRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates user and staff record', async () => {
      const dto = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        specialization: StaffSpecialization.CLEANING,
        currency: 'ARS',
      };

      usersRepository.findOne!.mockResolvedValue(null);
      const savedUser = { id: 'user-uuid-2', ...dto };
      usersRepository.create!.mockReturnValue(savedUser);
      usersRepository.save!.mockResolvedValue(savedUser);

      const savedStaff = mockStaff({ id: 'new-staff-id' });
      staffRepository.create!.mockReturnValue(savedStaff);
      staffRepository.save!.mockResolvedValue(savedStaff);
      staffRepository.findOne!.mockResolvedValue(savedStaff);

      const result = await service.create(dto, 'company-uuid-1');

      expect(usersRepository.save).toHaveBeenCalled();
      expect(staffRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedStaff);
    });

    it('throws ConflictException when email already exists', async () => {
      const dto = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'existing@example.com',
        specialization: StaffSpecialization.CLEANING,
      };

      usersRepository.findOne!.mockResolvedValue({ id: 'existing-user' });

      await expect(service.create(dto, 'company-uuid-1')).rejects.toThrow(
        ConflictException,
      );

      expect(staffRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates staff and user fields', async () => {
      const staff = mockStaff();
      staffRepository.findOne!.mockResolvedValue(staff);
      usersRepository.findOne!.mockResolvedValue(null);
      usersRepository.save!.mockResolvedValue(staff.user);
      staffRepository.save!.mockResolvedValue(staff);

      const updated = mockStaff({ notes: 'updated notes' });
      staffRepository
        .findOne!.mockResolvedValueOnce(staff)
        .mockResolvedValueOnce(updated);

      const result = await service.update(
        'staff-uuid-1',
        { notes: 'updated notes' },
        'company-uuid-1',
      );

      expect(usersRepository.save).toHaveBeenCalled();
      expect(staffRepository.save).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('soft deletes staff and deactivates user', async () => {
      const staff = mockStaff();
      staffRepository.findOne!.mockResolvedValue(staff);
      usersRepository.update!.mockResolvedValue({ affected: 1 });
      staffRepository.softDelete!.mockResolvedValue({ affected: 1 });

      await service.remove('staff-uuid-1', 'company-uuid-1');

      expect(usersRepository.update).toHaveBeenCalledWith(staff.userId, {
        isActive: false,
      });
      expect(staffRepository.softDelete).toHaveBeenCalledWith('staff-uuid-1');
    });

    it('throws NotFoundException when staff not found', async () => {
      staffRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.remove('missing-id', 'company-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
