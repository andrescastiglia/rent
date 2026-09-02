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
import { UserRole } from '../users/entities/user.entity';

describe('PropertiesService', () => {
  const originalPropertyImageSigningSecret =
    process.env.PROPERTY_IMAGE_SIGNING_SECRET;
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
      leftJoin: jest.fn().mockReturnThis(),
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
  const adminActor = {
    id: 'admin-user',
    role: 'admin',
    companyId: 'company-1',
  };
  const ownerActor = {
    id: 'owner-1',
    role: 'owner',
    companyId: 'company-1',
  };

  beforeEach(async () => {
    process.env.PROPERTY_IMAGE_SIGNING_SECRET = 'test-property-image-secret';
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

  afterAll(() => {
    if (originalPropertyImageSigningSecret === undefined) {
      delete process.env.PROPERTY_IMAGE_SIGNING_SECRET;
      return;
    }
    process.env.PROPERTY_IMAGE_SIGNING_SECRET =
      originalPropertyImageSigningSecret;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(propertyImagesRepository).toBeDefined();
  });

  describe('create', () => {
    it('should reject create when company scope is missing', async () => {
      await expect(
        service.create({} as any, { id: 'u1', role: 'admin' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject create for admin without ownerId', async () => {
      await expect(
        service.create(
          {
            name: 'No owner',
            propertyType: PropertyType.APARTMENT,
            addressStreet: 'A',
            addressCity: 'C',
            addressState: 'S',
          } as any,
          { id: 'admin-user', role: 'admin', companyId: 'company-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject create when selected owner does not exist in company', async () => {
      ownerRepository.findOne!.mockResolvedValue(null);
      await expect(
        service.create(
          {
            ownerId: 'owner-missing',
            name: 'Test Property',
            propertyType: PropertyType.APARTMENT,
            addressStreet: 'A',
            addressCity: 'C',
            addressState: 'S',
          } as any,
          { id: 'owner-user-1', role: 'owner', companyId: 'company-1' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

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

    it('should create a property with separate rent and sale prices', async () => {
      const createPropertyDto = {
        ownerId: 'owner-1',
        companyId: 'company-1',
        name: 'Dual operation property',
        propertyType: PropertyType.APARTMENT,
        addressStreet: 'Main 123',
        addressCity: 'Test City',
        addressState: 'Test State',
        addressPostalCode: '12345',
        status: PropertyStatus.ACTIVE,
        rentPrice: 1200,
        salePrice: 100000,
      };

      propertyRepository.create!.mockReturnValue({
        ...mockProperty,
        rentPrice: 1200,
        salePrice: 100000,
      });
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        rentPrice: 1200,
        salePrice: 100000,
      });
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
      expect(result.rentPrice).toBe(1200);
      expect(result.salePrice).toBe(100000);
    });
  });

  describe('findAll', () => {
    it('should return paginated properties', async () => {
      const filters = { page: 1, limit: 10 };
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockProperty], 1]),
      };

      propertyRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      const result = await service.findAll(filters, adminActor);

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
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockProperty], 1]),
      };

      propertyRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters, adminActor);

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
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockProperty], 1]),
      };

      propertyRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

      await service.findAll(filters, adminActor);

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

  describe('update', () => {
    it('should update a property when user is owner', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(mockProperty as any);
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        ...updateDto,
      });

      const result = await service.update('1', updateDto, ownerActor);

      expect(result.addressStreet).toBe('Updated Address');
    });

    it('should update a property when user is admin', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(mockProperty as any);
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        ...updateDto,
      });

      const result = await service.update('1', updateDto, adminActor);

      expect(result.addressStreet).toBe('Updated Address');
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      const updateDto = { addressStreet: 'Updated Address' };
      jest
        .spyOn(service, 'findOneScoped')
        .mockRejectedValue(new NotFoundException());

      await expect(
        service.update('1', updateDto, {
          ...ownerActor,
          id: 'different-user',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a property when no occupied units', async () => {
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(mockProperty as any);
      unitRepository.count!.mockResolvedValue(0);
      propertyRepository.softDelete!.mockResolvedValue({
        affected: 1,
        raw: [],
      });

      await service.remove('1', ownerActor);

      expect(unitRepository.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          propertyId: '1',
          companyId: 'company-1',
          status: UnitStatus.OCCUPIED,
        }),
      });
      expect(propertyRepository.softDelete).toHaveBeenCalledWith({
        id: '1',
        companyId: 'company-1',
      });
    });

    it('should throw BadRequestException when property has occupied units', async () => {
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(mockProperty as any);
      unitRepository.count!.mockResolvedValue(1);

      await expect(service.remove('1', ownerActor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException when user is not owner or admin', async () => {
      jest
        .spyOn(service, 'findOneScoped')
        .mockRejectedValue(new NotFoundException());

      await expect(
        service.remove('1', { ...ownerActor, id: 'different-user' }),
      ).rejects.toThrow(NotFoundException);
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

    it('should reject legacy public upload refs', () => {
      const normalized = (service as any).normalizePropertyImages([
        'https://example.com/api/uploads/properties/house-1.jpg',
      ]);

      expect(normalized).toEqual([]);
    });

    it('should validate upload and image lookup branches', async () => {
      await expect(
        service.uploadPropertyImage(
          { buffer: Buffer.from('x'), mimetype: 'image/png' },
          { id: 'u1', role: 'admin' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.uploadPropertyImage({ mimetype: 'image/png' }, {
          id: 'u1',
          role: 'admin',
          companyId: 'company-1',
        } as any),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.uploadPropertyImage(
          { buffer: Buffer.from('x'), mimetype: 'application/pdf' },
          { id: 'u1', role: 'admin', companyId: 'company-1' } as any,
        ),
      ).rejects.toThrow(BadRequestException);

      propertyImagesRepository.findOne!.mockResolvedValueOnce(null);
      await expect(service.getPropertyImage('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should discard uploaded images and enforce company scope', async () => {
      await expect(
        service.discardUploadedImages(['/uploads/properties/a.jpg'], {
          id: 'u1',
          role: 'owner',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      const deleteQb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      propertyImagesRepository.createQueryBuilder!.mockReturnValue(
        deleteQb as any,
      );

      const result = await service.discardUploadedImages(
        ['/properties/images/123e4567-e89b-42d3-a456-426614174000'],
        { id: 'u1', role: 'owner', companyId: 'company-1' } as any,
      );

      expect(result.deleted).toBe(1);
      expect(deleteQb.andWhere).toHaveBeenCalledWith(
        'uploaded_by_user_id = :uploadedByUserId',
        { uploadedByUserId: 'u1' },
      );
    });

    it('should parse image ids safely', () => {
      const validId = '123e4567-e89b-42d3-a456-426614174000';

      expect(
        (service as any).toPropertyImageId(`/properties/images/${validId}`),
      ).toBe(validId);
      expect(
        (service as any).toPropertyImageId(
          `https://example.com/api/properties/images/${validId}?v=1`,
        ),
      ).toBe(validId);
      expect((service as any).toPropertyImageId('https://%%invalid-url')).toBe(
        null,
      );
      expect(
        (service as any).toPropertyImageId('/properties/images/not-a-uuid'),
      ).toBe(null);
    });
  });

  describe('private scope and owner resolution branches', () => {
    it('should apply visibility scope by role', () => {
      const adminQuery = { andWhere: jest.fn(), innerJoin: jest.fn() };
      (service as any).applyVisibilityScope(adminQuery as any, {
        id: 'u-admin',
        role: UserRole.ADMIN,
      });
      expect(adminQuery.andWhere).not.toHaveBeenCalled();
      expect(adminQuery.innerJoin).not.toHaveBeenCalled();

      const ownerQuery = { andWhere: jest.fn(), innerJoin: jest.fn() };
      (service as any).applyVisibilityScope(ownerQuery as any, {
        id: 'u-owner',
        role: UserRole.OWNER,
        email: ' Owner@Test.com ',
        phone: '123',
      });
      expect(ownerQuery.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('owner.user_id = :scopeUserId'),
        { scopeUserId: 'u-owner' },
      );

      const tenantQuery = {
        innerJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
      };
      (service as any).applyVisibilityScope(tenantQuery as any, {
        id: 'u-tenant',
        role: UserRole.TENANT,
        email: 'tenant@test.com',
        phone: '',
      });
      expect(tenantQuery.innerJoin).toHaveBeenCalledTimes(2);
      expect(tenantQuery.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('tenant.user_id = :scopeUserId'),
        { scopeUserId: 'u-tenant' },
      );

      expect(() =>
        (service as any).applyVisibilityScope(tenantQuery as any, {
          id: 'u-buyer',
          role: UserRole.BUYER,
        }),
      ).toThrow(ForbiddenException);
    });

    it('should resolve owner for create in all key branches', async () => {
      await expect(
        (service as any).resolveOwnerForCreate('owner-1', {
          id: 'u1',
          role: 'owner',
        }),
      ).rejects.toThrow(ForbiddenException);

      ownerRepository.findOne!.mockResolvedValueOnce({
        id: 'owner-2',
        userId: 'other-user',
        companyId: 'company-1',
      });
      await expect(
        (service as any).resolveOwnerForCreate('owner-2', {
          id: 'u1',
          role: 'owner',
          companyId: 'company-1',
        }),
      ).rejects.toThrow(ForbiddenException);

      ownerRepository.findOne!.mockResolvedValueOnce({
        id: 'owner-ok',
        userId: 'u1',
        companyId: 'company-1',
      });
      const selectedOwner = await (service as any).resolveOwnerForCreate(
        'owner-ok',
        {
          id: 'u1',
          role: 'owner',
          companyId: 'company-1',
        },
      );
      expect(selectedOwner.id).toBe('owner-ok');

      ownerRepository.findOne!.mockResolvedValueOnce(null);
      await expect(
        (service as any).resolveOwnerForCreate(undefined, {
          id: 'u-admin',
          role: 'admin',
          companyId: 'company-1',
        }),
      ).rejects.toThrow(BadRequestException);

      ownerRepository.findOne!.mockResolvedValueOnce(null);
      await expect(
        (service as any).resolveOwnerForCreate(undefined, {
          id: 'u-owner',
          role: 'owner',
          companyId: 'company-1',
        }),
      ).rejects.toThrow(NotFoundException);

      ownerRepository.findOne!.mockResolvedValueOnce({
        id: 'owner-by-user',
        userId: 'u-owner',
        companyId: 'company-1',
      });
      const ownerByUser = await (service as any).resolveOwnerForCreate(
        undefined,
        {
          id: 'u-owner',
          role: 'owner',
          companyId: 'company-1',
        },
      );
      expect(ownerByUser.id).toBe('owner-by-user');
    });

    it('should find one scoped and apply company filter', async () => {
      const scopedQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: '1' }),
      };
      propertyRepository.createQueryBuilder!.mockReturnValue(scopedQb as any);

      const result = await service.findOneScoped('1', {
        id: 'u-staff',
        role: UserRole.STAFF,
        companyId: 'company-1',
      } as any);

      expect(result).toEqual({ id: '1' });
      expect(scopedQb.andWhere).toHaveBeenCalledWith(
        'property.company_id = :companyId',
        { companyId: 'company-1' },
      );
    });

    it('should throw NotFoundException when findOneScoped returns null', async () => {
      const scopedQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      propertyRepository.createQueryBuilder!.mockReturnValue(scopedQb as any);

      await expect(
        service.findOneScoped('missing', {
          id: 'u-staff',
          role: UserRole.STAFF,
          companyId: 'company-1',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should apply staff visibility scope without extra constraints', () => {
      const staffQuery = { andWhere: jest.fn(), innerJoin: jest.fn() };
      (service as any).applyVisibilityScope(staffQuery as any, {
        id: 'u-staff',
        role: UserRole.STAFF,
      });
      expect(staffQuery.andWhere).not.toHaveBeenCalled();
      expect(staffQuery.innerJoin).not.toHaveBeenCalled();
    });
  });

  describe('update with images', () => {
    const propertyWithImages = {
      ...mockProperty,
      images: ['/properties/images/aaaaaaaa-aaaa-1aaa-aaaa-aaaaaaaaaa00'],
    };

    it('should update a property with new images and remove old ones', async () => {
      const newImageId = 'bbbbbbbb-bbbb-1bbb-9bbb-bbbbbbbbbbbb';
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(propertyWithImages as any);
      propertyRepository.save!.mockImplementation(async (data) => data);

      propertyImagesRepository.find!.mockResolvedValue([
        { id: newImageId, propertyId: null, uploadedByUserId: ownerActor.id },
      ]);

      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const deleteQb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      let qbCallCount = 0;
      propertyImagesRepository.createQueryBuilder!.mockImplementation(() => {
        qbCallCount++;
        return qbCallCount === 1 ? updateQb : deleteQb;
      });

      await service.update(
        '1',
        { images: [`/properties/images/${newImageId}`] },
        ownerActor,
      );

      expect(updateQb.set).toHaveBeenCalledWith({
        propertyId: '1',
        isTemporary: false,
      });
      expect(deleteQb.execute).toHaveBeenCalled();
      expect(updateQb.andWhere).toHaveBeenCalledWith(
        'uploaded_by_user_id = :uploadedByUserId',
        { uploadedByUserId: ownerActor.id },
      );
    });

    it('should reject an image uploaded by another owner', async () => {
      const imageId = 'bbbbbbbb-bbbb-1bbb-9bbb-bbbbbbbbbbbc';
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(propertyWithImages as any);
      propertyImagesRepository.find!.mockResolvedValue([
        {
          id: imageId,
          propertyId: null,
          uploadedByUserId: 'another-owner-user',
        },
      ]);

      await expect(
        service.update(
          '1',
          { images: [`/properties/images/${imageId}`] },
          ownerActor,
        ),
      ).rejects.toThrow('Some property images are invalid');
      expect(propertyRepository.save).not.toHaveBeenCalled();
    });

    it('should throw when some images are invalid', async () => {
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(propertyWithImages as any);
      propertyImagesRepository.find!.mockResolvedValue([]);

      await expect(
        service.update(
          '1',
          {
            images: ['/properties/images/cccccccc-cccc-1ccc-9ccc-cccccccccccc'],
          },
          ownerActor,
        ),
      ).rejects.toThrow('Some property images are invalid');
    });

    it('should throw when an image is already assigned to another property', async () => {
      const imgId = 'dddddddd-dddd-1ddd-9ddd-dddddddddddd';
      jest
        .spyOn(service, 'findOneScoped')
        .mockResolvedValue(propertyWithImages as any);
      propertyImagesRepository.find!.mockResolvedValue([
        {
          id: imgId,
          propertyId: 'other-property',
          uploadedByUserId: ownerActor.id,
        },
      ]);

      await expect(
        service.update(
          '1',
          { images: [`/properties/images/${imgId}`] },
          ownerActor,
        ),
      ).rejects.toThrow(
        'One or more images are already assigned to another property',
      );
    });
  });

  describe('uploadPropertyImage success', () => {
    it('should save a verified image and return a signed temporary URL', async () => {
      const imageId = '123e4567-e89b-42d3-a456-426614174000';
      const savedImage = { id: imageId };
      propertyImagesRepository.create!.mockReturnValue(savedImage);
      propertyImagesRepository.save!.mockResolvedValue(savedImage);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      const result = await service.uploadPropertyImage(
        {
          buffer: png,
          mimetype: 'image/png',
          originalname: 'photo.png',
          size: 1,
        },
        { id: 'u1', role: 'admin', companyId: 'company-1' },
      );

      expect(result.url).toMatch(
        new RegExp(
          `^/properties/images/${imageId}\\?expires=\\d+&signature=[0-9a-f]{64}$`,
        ),
      );
      expect(propertyImagesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          mimeType: 'image/png',
          sizeBytes: png.length,
          isTemporary: true,
        }),
      );
    });

    it('should reject oversized, unsupported and spoofed images', async () => {
      const user = { id: 'u1', role: 'admin', companyId: 'company-1' };

      await expect(
        service.uploadPropertyImage(
          {
            buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
            mimetype: 'image/png',
          },
          user,
        ),
      ).rejects.toThrow('Image must not exceed 5 MiB');

      await expect(
        service.uploadPropertyImage(
          { buffer: Buffer.from('<svg/>'), mimetype: 'image/svg+xml' },
          user,
        ),
      ).rejects.toThrow('Only JPEG, PNG and WebP images are allowed');

      await expect(
        service.uploadPropertyImage(
          { buffer: Buffer.from('not-a-png'), mimetype: 'image/png' },
          user,
        ),
      ).rejects.toThrow('Image content does not match its MIME type');
    });
  });

  describe('getPropertyImage success', () => {
    it('should return a permanent image without a temporary signature', async () => {
      const image = {
        id: 'img-1',
        data: Buffer.from('data'),
        isTemporary: false,
      };
      propertyImagesRepository.findOne!.mockResolvedValue(image);

      const result = await service.getPropertyImage('img-1');
      expect(result).toEqual(image);
    });

    it('should require a valid, unexpired signature for a temporary image', async () => {
      const imageId = '123e4567-e89b-42d3-a456-426614174000';
      const image = {
        id: imageId,
        data: Buffer.from('data'),
        isTemporary: true,
      };
      propertyImagesRepository.findOne!.mockResolvedValue(image);

      await expect(service.getPropertyImage(imageId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        service.getPropertyImage(imageId, '9999999999', '0'.repeat(64)),
      ).rejects.toThrow(NotFoundException);

      const signedUrl = (service as any).createTemporaryPropertyImageUrl(
        imageId,
      );
      const query = new URL(`https://example.test${signedUrl}`).searchParams;
      await expect(
        service.getPropertyImage(
          imageId,
          query.get('expires') ?? undefined,
          query.get('signature') ?? undefined,
        ),
      ).resolves.toEqual(image);

      const expired = Math.floor(Date.now() / 1000) - 1;
      const expiredSignature = (service as any).signTemporaryPropertyImage(
        imageId,
        expired,
      );
      await expect(
        service.getPropertyImage(imageId, String(expired), expiredSignature),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll with user context and filters', () => {
    it('should apply owner, state, propertyType, status filters', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        innerJoin: jest.fn().mockReturnThis(),
      };
      propertyRepository.createQueryBuilder!.mockReturnValue(mockQb);

      await service.findAll(
        {
          ownerId: 'o1',
          addressState: 'BA',
          propertyType: PropertyType.HOUSE,
          status: PropertyStatus.ACTIVE,
          minRent: 1000,
          maxRent: 5000,
          bedrooms: 3,
          bathrooms: 2,
          page: 2,
          limit: 5,
        },
        {
          id: 'u1',
          role: UserRole.TENANT,
          companyId: 'company-1',
          email: 'test@test.com',
          phone: '555',
        },
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'property.owner_id = :ownerId',
        { ownerId: 'o1' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'property.address_state ILIKE :addressState',
        { addressState: '%BA%' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'property.property_type = :propertyType',
        { propertyType: PropertyType.HOUSE },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'property.status = :status',
        { status: PropertyStatus.ACTIVE },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(property.rent_price >= :minRent OR units.base_rent >= :minRent)',
        { minRent: 1000 },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(property.rent_price <= :maxRent OR units.base_rent <= :maxRent)',
        { maxRent: 5000 },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'units.bedrooms = :bedrooms',
        { bedrooms: 3 },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'units.bathrooms = :bathrooms',
        { bathrooms: 2 },
      );
      expect(mockQb.skip).toHaveBeenCalledWith(5);
      expect(mockQb.take).toHaveBeenCalledWith(5);
    });
  });

  describe('edge cases for image parsing', () => {
    it('should return null for empty, null, or non-string inputs', () => {
      expect((service as any).toPropertyImageId('')).toBeNull();
      expect((service as any).toPropertyImageId(null)).toBeNull();
      expect((service as any).toPropertyImageId(123)).toBeNull();
      expect((service as any).toPropertyImageId('   ')).toBeNull();
    });

    it('should return null for paths without matching prefix', () => {
      expect((service as any).toPropertyImageId('/other/path/uuid')).toBeNull();
    });
  });

  describe('deletePropertyImages without companyId', () => {
    it('should delete images without company filter', async () => {
      const deleteQb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };
      propertyImagesRepository.createQueryBuilder!.mockReturnValue(deleteQb);

      const imgId = 'eeeeeeee-eeee-1eee-aeee-eeeeeeeeeeee';
      const result = await (service as any).deletePropertyImages(
        [`/properties/images/${imgId}`],
        undefined,
      );

      expect(result).toBe(2);
      expect(deleteQb.andWhere).not.toHaveBeenCalled();
    });

    it('should return 0 for empty array', async () => {
      const result = await (service as any).deletePropertyImages([], 'c1');
      expect(result).toBe(0);
    });
  });

  describe('create with images', () => {
    it('should create property with uploaded images', async () => {
      const imgId = 'ffffffff-ffff-1fff-bfff-ffffffffffff';
      ownerRepository.findOne!.mockResolvedValue({
        id: 'owner-1',
        companyId: 'company-1',
        userId: 'admin-user',
      });
      propertyImagesRepository.find!.mockResolvedValue([
        { id: imgId, propertyId: null },
      ]);
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      propertyImagesRepository.createQueryBuilder!.mockReturnValue(updateQb);

      propertyRepository.create!.mockReturnValue({
        ...mockProperty,
        id: 'new-prop',
      });
      propertyRepository.save!.mockResolvedValue({
        ...mockProperty,
        id: 'new-prop',
      });

      await service.create(
        {
          ownerId: 'owner-1',
          name: 'Prop with Images',
          propertyType: PropertyType.APARTMENT,
          addressStreet: 'A',
          addressCity: 'C',
          addressState: 'S',
          images: [`/properties/images/${imgId}`],
        } as any,
        { id: 'admin-user', role: 'admin', companyId: 'company-1' },
      );

      expect(updateQb.set).toHaveBeenCalledWith({
        propertyId: 'new-prop',
        isTemporary: false,
      });
    });
  });
});
