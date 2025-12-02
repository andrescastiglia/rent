import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TenantsService } from './tenants.service';
import { User, UserRole } from '../users/entities/user.entity';
import { Lease } from '../leases/entities/lease.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('TenantsService', () => {
  let service: TenantsService;
  let userRepository: MockRepository<User>;
  let leaseRepository: MockRepository<Lease>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockQueryBuilder = (): any => {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
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
          provide: getRepositoryToken(User),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Lease),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    userRepository = module.get(getRepositoryToken(User));
    leaseRepository = module.get(getRepositoryToken(Lease));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
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
        expect.arrayContaining([mockUser.id, createDto.dni]),
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
        '(user.first_name ILIKE :name OR user.last_name ILIKE :name)',
        { name: '%John%' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a tenant by id', async () => {
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
  });

  describe('update', () => {
    it('should update tenant information', async () => {
      const updateDto = { firstName: 'Jane', phone: '+111111111' };
      userRepository.findOne!.mockResolvedValue(mockUser);
      userRepository.save!.mockResolvedValue({ ...mockUser, ...updateDto });
      userRepository.query!.mockResolvedValue([]);

      const result = await service.update('user-1', updateDto);

      expect(userRepository.save).toHaveBeenCalled();
      expect(result.firstName).toBe('Jane');
    });

    it('should update tenant-specific fields via raw query', async () => {
      const updateDto = { dni: '87654321' };
      userRepository.findOne!.mockResolvedValue(mockUser);
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
      userRepository.softDelete = jest.fn().mockResolvedValue({ affected: 1 });

      await service.remove('user-1');

      expect(userRepository.softDelete).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getLeaseHistory', () => {
    it('should return lease history for tenant', async () => {
      const mockLeases = [{ id: 'lease-1', tenantId: 'user-1' }];
      leaseRepository.find!.mockResolvedValue(mockLeases);

      const result = await service.getLeaseHistory('user-1');

      expect(leaseRepository.find).toHaveBeenCalledWith({
        where: { tenantId: 'user-1' },
        relations: ['unit', 'unit.property'],
        order: { startDate: 'DESC' },
      });
      expect(result).toEqual(mockLeases);
    });
  });
});
