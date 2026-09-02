import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitsService } from './units.service';
import { Unit, UnitStatus } from './entities/unit.entity';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Property } from './entities/property.entity';
import { UserRole } from '../users/entities/user.entity';

describe('UnitsService', () => {
  let service: UnitsService;
  let repository: MockRepository<Unit>;
  let propertyRepository: MockRepository<Property>;
  let propertyQueryBuilder: any;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const mockUnit: Partial<Unit> = {
    id: 'unit-1',
    propertyId: 'property-1',
    companyId: 'company-1',
    unitNumber: '101',
    bedrooms: 2,
    bathrooms: 1,
    area: 65,
    baseRent: 1500,
    status: UnitStatus.AVAILABLE,
  };
  const admin = {
    id: 'admin-1',
    companyId: 'company-1',
    role: UserRole.ADMIN,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitsService,
        {
          provide: getRepositoryToken(Unit),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<UnitsService>(UnitsService);
    repository = module.get(getRepositoryToken(Unit));
    propertyRepository = module.get(getRepositoryToken(Property));
    propertyQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'property-1',
        companyId: 'company-1',
      }),
    };
    propertyRepository.createQueryBuilder!.mockReturnValue(
      propertyQueryBuilder,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a unit', async () => {
      const createUnitDto = {
        propertyId: 'property-1',
        unitNumber: '101',
        bedrooms: 2,
        bathrooms: 1,
        area: 65,
        baseRent: 1500,
      };

      repository.create!.mockReturnValue(mockUnit);
      repository.save!.mockResolvedValue(mockUnit);

      const result = await service.create(createUnitDto as any, admin);

      expect(repository.create).toHaveBeenCalledWith({
        ...createUnitDto,
        companyId: 'company-1',
      });
      expect(repository.save).toHaveBeenCalledWith(mockUnit);
      expect(result).toEqual(mockUnit);
    });
  });

  describe('findByProperty', () => {
    it('should return units for a property', async () => {
      const units = [
        mockUnit,
        { ...mockUnit, id: 'unit-2', unitNumber: '102' },
      ];
      repository.find!.mockResolvedValue(units);

      const result = await service.findByProperty('property-1', admin);

      expect(repository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          propertyId: 'property-1',
          companyId: 'company-1',
        }),
        order: { unitNumber: 'ASC' },
      });
      expect(result).toEqual(units);
    });
  });

  describe('findOne', () => {
    it('should return a unit by id', async () => {
      repository.findOne!.mockResolvedValue(mockUnit);

      const result = await service.findOne('unit-1', admin);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'unit-1',
          companyId: 'company-1',
        }),
        relations: ['property'],
      });
      expect(result).toEqual(mockUnit);
    });

    it('should throw NotFoundException when unit not found', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('999', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a unit', async () => {
      const updateDto = { baseRent: 1600, status: UnitStatus.OCCUPIED };
      repository.findOne!.mockResolvedValue(mockUnit);
      repository.save!.mockResolvedValue({ ...mockUnit, ...updateDto });

      const result = await service.update('unit-1', updateDto, admin);

      expect(repository.save).toHaveBeenCalled();
      expect(result.baseRent).toBe(1600);
      expect(result.status).toBe(UnitStatus.OCCUPIED);
    });
  });

  describe('remove', () => {
    it('should soft delete a unit', async () => {
      repository.findOne!.mockResolvedValue(mockUnit);
      repository.softDelete!.mockResolvedValue({ affected: 1, raw: [] });

      await service.remove('unit-1', admin);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'unit-1',
          companyId: 'company-1',
        }),
        relations: ['property'],
      });
      expect(repository.softDelete).toHaveBeenCalledWith('unit-1');
    });
  });

  it('rejects cross-company units and scopes owners to their property', async () => {
    repository.findOne!.mockResolvedValue(null);
    await expect(service.findOne('unit-company-b', admin)).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-1' }),
      }),
    );

    propertyQueryBuilder.getOne.mockResolvedValue({
      id: 'property-1',
      companyId: 'company-1',
    });
    await service.findByProperty('property-1', {
      id: 'owner-user-1',
      companyId: 'company-1',
      role: UserRole.OWNER,
    });
    expect(propertyQueryBuilder.andWhere).toHaveBeenCalledWith(
      'scopeOwner.user_id = :actorId',
      { actorId: 'owner-user-1' },
    );
  });

  it('rejects unit mutation by tenant actors', async () => {
    await expect(
      service.update(
        'unit-1',
        {},
        {
          id: 'tenant-user-1',
          companyId: 'company-1',
          role: UserRole.TENANT,
        },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});
