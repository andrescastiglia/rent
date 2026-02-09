import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertiesService } from './properties.service';
import {
  Property,
  PropertyType,
  PropertyStatus,
} from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { Owner } from '../owners/entities/owner.entity';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let propertyRepository: MockRepository<Property>;
  let propertyImagesRepository: MockRepository<PropertyImage>;
  let unitRepository: MockRepository<Unit>;
  let ownerRepository: MockRepository<Owner>;

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
    findOneBy: jest.fn(),
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
          provide: getRepositoryToken(PropertyImage),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Unit),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Owner),
          useValue: createMockRepository(),
        },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
    propertyRepository = module.get(getRepositoryToken(Property));
    propertyImagesRepository = module.get(getRepositoryToken(PropertyImage));
    unitRepository = module.get(getRepositoryToken(Unit));
    ownerRepository = module.get(getRepositoryToken(Owner));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(propertyImagesRepository).toBeDefined();
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
      ownerRepository.findOne!.mockResolvedValue({
        id: 'owner-1',
        companyId: 'company-1',
        userId: 'owner-user-1',
      } as any);

      const result = await service.create(createPropertyDto, {
        id: 'admin-user',
        role: 'admin',
        companyId: 'company-1',
      });

      expect(propertyRepository.create).toHaveBeenCalledWith({
        ...createPropertyDto,
        companyId: 'company-1',
        ownerId: 'owner-1',
        images: [],
      });
      expect(propertyRepository.save).toHaveBeenCalledWith(mockProperty);
      expect(result).toEqual(mockProperty);
    });

    it('should allow owner WhatsApp contact', async () => {
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
        ownerWhatsapp: '+54 9 11 1234-5678',
      };

      const propertyWithWhatsapp = {
        ...mockProperty,
        ownerWhatsapp: '+54 9 11 1234-5678',
      };

      propertyRepository.create!.mockReturnValue(propertyWithWhatsapp);
      propertyRepository.save!.mockResolvedValue(propertyWithWhatsapp);
      ownerRepository.findOne!.mockResolvedValue({
        id: 'owner-1',
        companyId: 'company-1',
        userId: 'owner-user-1',
      } as any);

      const result = await service.create(createPropertyDto, {
        id: 'admin-user',
        role: 'admin',
        companyId: 'company-1',
      });

      expect(propertyRepository.create).toHaveBeenCalledWith({
        ...createPropertyDto,
        companyId: 'company-1',
        ownerId: 'owner-1',
        images: [],
      });
      expect(result.ownerWhatsapp).toBe('+54 9 11 1234-5678');
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

    it('should filter properties by sale price range', async () => {
      const filters = {
        minSalePrice: 100000,
        maxSalePrice: 200000,
        page: 1,
        limit: 10,
      };
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
        'property.sale_price >= :minSalePrice',
        { minSalePrice: 100000 },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'property.sale_price <= :maxSalePrice',
        { maxSalePrice: 200000 },
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

  describe('image ref normalization', () => {
    it('should normalize DB image refs with API prefix path', () => {
      const id = '4e59d6ea-e329-4cc8-b0ed-b8aa8ecf95bb';
      const normalized = (service as any).normalizePropertyImages([
        `https://example.com/api/properties/images/${id}`,
      ]);

      expect(normalized).toEqual([`/properties/images/${id}`]);
    });

    it('should normalize legacy upload refs with API prefix path', () => {
      const normalized = (service as any).normalizePropertyImages([
        'https://example.com/api/uploads/properties/house-1.jpg',
      ]);

      expect(normalized).toEqual(['/uploads/properties/house-1.jpg']);
    });
  });
});
