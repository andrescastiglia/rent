import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertiesService } from './properties.service';
import {
  Property,
  PropertyType,
  PropertyStatus,
} from './entities/property.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let propertyRepository: MockRepository<Property>;
  let unitRepository: MockRepository<Unit>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    })),
  });

  const mockProperty: Partial<Property> = {
    id: '1',
    ownerId: 'owner-1',
    companyId: 'company-1',
    name: 'Test Property',
    addressStreet: 'Test Address',
    addressCity: 'Test City',
    addressState: 'Test State',
    addressPostalCode: '12345',
    propertyType: PropertyType.APARTMENT,
    status: PropertyStatus.ACTIVE,
    owner: { userId: 'owner-1' } as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    propertyRepository = module.get(getRepositoryToken(Property));
    unitRepository = module.get(getRepositoryToken(Unit));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a property', async () => {
      const createPropertyDto = {
        ownerId: 'owner-1',
        companyId: 'company-1',
        name: 'Test Property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Test Address',
        addressCity: 'Test City',
        addressState: 'Test State',
        addressPostalCode: '12345',
        status: PropertyStatus.ACTIVE,
      };

      propertyRepository.create!.mockReturnValue(mockProperty);
      propertyRepository.save!.mockResolvedValue(mockProperty);

      const result = await service.create(createPropertyDto);

      expect(propertyRepository.create).toHaveBeenCalledWith(createPropertyDto);
      expect(propertyRepository.save).toHaveBeenCalledWith(mockProperty);
      expect(result).toEqual(mockProperty);
    });
  });

  describe('findAll', () => {
    it('should return paginated properties', async () => {
      const filters = { page: 1, limit: 10 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockProperty], 1]),
      };

      propertyRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filters);

      expect(result).toEqual({
        data: [mockProperty],
        total: 1,
        page: 1,
        limit: 10,
      });
    });

    it('should filter properties by city', async () => {
      const filters = { addressCity: 'Test', page: 1, limit: 10 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockProperty], 1]),
      };

      propertyRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'property.address_city ILIKE :addressCity',
        { addressCity: '%Test%' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a property by id', async () => {
      propertyRepository.findOne!.mockResolvedValue(mockProperty);

      const result = await service.findOne('1');

      expect(propertyRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
        relations: ['units', 'features', 'owner', 'company'],
      });
      expect(result).toEqual(mockProperty);
    });

    it('should throw NotFoundException when property not found', async () => {
      propertyRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a property when user is owner', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      propertyRepository.findOne!.mockResolvedValue(mockProperty);
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        ...updateDto,
      });

      const result = await service.update('1', updateDto, 'owner-1', 'owner');

      expect(result.addressStreet).toBe('Updated Address');
    });

    it('should update a property when user is admin', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      propertyRepository.findOne!.mockResolvedValue(mockProperty);
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        ...updateDto,
      });

      const result = await service.update(
        '1',
        updateDto,
        'different-user',
        'admin',
      );

      expect(result.addressStreet).toBe('Updated Address');
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      propertyRepository.findOne!.mockResolvedValue(mockProperty);

      await expect(
        service.update('1', updateDto, 'different-user', 'owner'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a property when no occupied units', async () => {
      propertyRepository.findOne!.mockResolvedValue(mockProperty);
      unitRepository.count!.mockResolvedValue(0);
      propertyRepository.softDelete!.mockResolvedValue({
        affected: 1,
        raw: [],
      });

      await service.remove('1', 'owner-1', 'owner');

      expect(unitRepository.count).toHaveBeenCalledWith({
        where: { propertyId: '1', status: UnitStatus.OCCUPIED },
      });
      expect(propertyRepository.softDelete).toHaveBeenCalledWith('1');
    });

    it('should throw BadRequestException when property has occupied units', async () => {
      propertyRepository.findOne!.mockResolvedValue(mockProperty);
      unitRepository.count!.mockResolvedValue(1);

      await expect(service.remove('1', 'owner-1', 'owner')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      propertyRepository.findOne!.mockResolvedValue(mockProperty);

      await expect(
        service.remove('1', 'different-user', 'owner'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
