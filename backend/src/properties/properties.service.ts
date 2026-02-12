import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Property } from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyFiltersDto } from './dto/property-filters.dto';
import { Owner } from '../owners/entities/owner.entity';
import {
  ContractType,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { UserRole } from '../users/entities/user.entity';

interface UserContext {
  id: string;
  role: string;
  companyId?: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class PropertiesService {
  private static readonly PROPERTY_IMAGE_ID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(Property)
    private propertiesRepository: Repository<Property>,
    @InjectRepository(PropertyImage)
    private propertyImagesRepository: Repository<PropertyImage>,
    @InjectRepository(Unit)
    private unitsRepository: Repository<Unit>,
    @InjectRepository(Owner)
    private ownersRepository: Repository<Owner>,
  ) {}

  async create(
    createPropertyDto: CreatePropertyDto,
    user: UserContext,
  ): Promise<Property> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const owner = await this.resolveOwnerForCreate(
      createPropertyDto.ownerId,
      user,
    );
    const normalizedImages = this.normalizePropertyImages(
      createPropertyDto.images,
    );
    const imageIds = await this.ensureUsablePropertyImageIds(
      normalizedImages,
      user.companyId,
    );

    const property = this.propertiesRepository.create({
      ...createPropertyDto,
      images: normalizedImages,
      companyId: user.companyId,
      ownerId: owner.id,
    });
    const createdProperty = await this.propertiesRepository.save(property);
    await this.attachPropertyImagesToProperty(
      imageIds,
      createdProperty.id,
      user.companyId,
    );

    return createdProperty;
  }

  async findAll(
    filters: PropertyFiltersDto,
    user?: UserContext,
  ): Promise<{ data: Property[]; total: number; page: number; limit: number }> {
    const {
      ownerId,
      addressCity,
      addressState,
      propertyType,
      status,
      minRent,
      maxRent,
      minSalePrice,
      maxSalePrice,
      bedrooms,
      bathrooms,
      page = 1,
      limit = 10,
    } = filters;

    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.units', 'units')
      .leftJoin('property.owner', 'owner')
      .leftJoin('owner.user', 'ownerUser')
      .where('property.deleted_at IS NULL');

    if (user?.companyId) {
      query.andWhere('property.company_id = :companyId', {
        companyId: user.companyId,
      });
    }

    if (ownerId) {
      query.andWhere('property.owner_id = :ownerId', { ownerId });
    }

    if (addressCity) {
      query.andWhere('property.address_city ILIKE :addressCity', {
        addressCity: `%${addressCity}%`,
      });
    }

    if (addressState) {
      query.andWhere('property.address_state ILIKE :addressState', {
        addressState: `%${addressState}%`,
      });
    }

    if (propertyType) {
      query.andWhere('property.property_type = :propertyType', {
        propertyType,
      });
    }

    if (status) {
      query.andWhere('property.status = :status', { status });
    }

    // Filter by unit specifications
    if (
      minRent !== undefined ||
      maxRent !== undefined ||
      minSalePrice !== undefined ||
      maxSalePrice !== undefined ||
      bedrooms !== undefined ||
      bathrooms !== undefined
    ) {
      if (minRent !== undefined) {
        query.andWhere(
          '(property.rent_price >= :minRent OR units.base_rent >= :minRent)',
          { minRent },
        );
      }
      if (maxRent !== undefined) {
        query.andWhere(
          '(property.rent_price <= :maxRent OR units.base_rent <= :maxRent)',
          { maxRent },
        );
      }
      if (minSalePrice !== undefined) {
        query.andWhere('property.sale_price >= :minSalePrice', {
          minSalePrice,
        });
      }
      if (maxSalePrice !== undefined) {
        query.andWhere('property.sale_price <= :maxSalePrice', {
          maxSalePrice,
        });
      }
      if (bedrooms !== undefined) {
        query.andWhere('units.bedrooms = :bedrooms', { bedrooms });
      }
      if (bathrooms !== undefined) {
        query.andWhere('units.bathrooms = :bathrooms', { bathrooms });
      }
    }

    if (user) {
      this.applyVisibilityScope(query, user);
    }

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Property> {
    const property = await this.propertiesRepository.findOne({
      where: { id },
      relations: ['units', 'features', 'owner', 'owner.user', 'company'],
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return property;
  }

  async findOneScoped(id: string, user: UserContext): Promise<Property> {
    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.units', 'units')
      .leftJoinAndSelect('property.features', 'features')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('property.company', 'company')
      .where('property.id = :id', { id })
      .andWhere('property.deleted_at IS NULL');

    if (user.companyId) {
      query.andWhere('property.company_id = :companyId', {
        companyId: user.companyId,
      });
    }

    this.applyVisibilityScope(query, user);

    const property = await query.getOne();
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return property;
  }

  async update(
    id: string,
    updatePropertyDto: UpdatePropertyDto,
    userId: string,
    userRole: string,
  ): Promise<Property> {
    const property = await this.findOne(id);
    const previousImageRefs = this.normalizePropertyImages(
      Array.isArray(property.images) ? property.images : [],
    );

    // Check ownership (only owner or admin can update)
    // property.owner is loaded via relation and has userId
    if (userRole !== 'admin' && property.owner?.userId !== userId) {
      throw new ForbiddenException('You can only update your own properties');
    }

    let nextImageIds: string[] = [];
    if (updatePropertyDto.images !== undefined) {
      updatePropertyDto.images = this.normalizePropertyImages(
        updatePropertyDto.images,
      );
      nextImageIds = await this.ensureUsablePropertyImageIds(
        updatePropertyDto.images,
        property.companyId,
        property.id,
      );
    }

    Object.assign(property, updatePropertyDto);
    const updatedProperty = await this.propertiesRepository.save(property);

    if (updatePropertyDto.images !== undefined) {
      await this.attachPropertyImagesToProperty(
        nextImageIds,
        property.id,
        property.companyId,
      );
      const removedImageRefs = this.findRemovedImageRefs(
        previousImageRefs,
        updatePropertyDto.images,
      );
      await this.deletePropertyImages(removedImageRefs, property.companyId);
    }

    return updatedProperty;
  }

  async remove(id: string, userId: string, userRole: string): Promise<void> {
    const property = await this.findOne(id);

    // Check ownership
    if (userRole !== 'admin' && property.owner?.userId !== userId) {
      throw new ForbiddenException('You can only delete your own properties');
    }

    // Check if property has occupied units
    const occupiedUnits = await this.unitsRepository.count({
      where: { propertyId: id, status: UnitStatus.OCCUPIED },
    });

    if (occupiedUnits > 0) {
      throw new BadRequestException(
        'Cannot delete property with occupied units',
      );
    }

    await this.propertiesRepository.softDelete(id);
    await this.deletePropertyImages(
      Array.isArray(property.images) ? property.images : [],
      property.companyId,
    );
  }

  async discardUploadedImages(
    images: string[],
    user: UserContext,
  ): Promise<{ deleted: number }> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
    const deleted = await this.deleteTemporaryPropertyImages(
      images,
      user.companyId,
    );
    return { deleted };
  }

  async uploadPropertyImage(
    file: any,
    user: UserContext,
  ): Promise<{ url: string }> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    if (!file.mimetype || !String(file.mimetype).startsWith('image/')) {
      throw new BadRequestException('Only image uploads are allowed');
    }

    const savedImage = await this.propertyImagesRepository.save(
      this.propertyImagesRepository.create({
        companyId: user.companyId,
        uploadedByUserId: user.id,
        originalName: file.originalname ?? null,
        mimeType: file.mimetype,
        sizeBytes:
          typeof file.size === 'number' ? file.size : file.buffer.length,
        data: file.buffer,
        isTemporary: true,
      }),
    );

    return { url: `/properties/images/${savedImage.id}` };
  }

  async getPropertyImage(imageId: string): Promise<PropertyImage> {
    const image = await this.propertyImagesRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException(
        `Property image with ID ${imageId} not found`,
      );
    }

    return image;
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<Property>,
    user: UserContext,
  ) {
    if (user.role === UserRole.ADMIN || user.role === UserRole.STAFF) {
      return;
    }

    const email = (user.email ?? '').trim().toLowerCase();
    const phone = (user.phone ?? '').trim();

    if (user.role === UserRole.OWNER) {
      query.andWhere(
        `(owner.user_id = :scopeUserId OR LOWER(ownerUser.email) = :scopeEmail OR (:scopePhone <> '' AND ownerUser.phone = :scopePhone))`,
        {
          scopeUserId: user.id,
          scopeEmail: email,
          scopePhone: phone,
        },
      );
      return;
    }

    if (user.role === UserRole.TENANT) {
      query
        .innerJoin(
          Lease,
          'tenantLease',
          'tenantLease.property_id = property.id AND tenantLease.contract_type = :rentalType AND tenantLease.status = :activeStatus AND tenantLease.deleted_at IS NULL',
          {
            rentalType: ContractType.RENTAL,
            activeStatus: LeaseStatus.ACTIVE,
          },
        )
        .innerJoin('tenantLease.tenant', 'tenant')
        .innerJoin('tenant.user', 'tenantUser')
        .andWhere(
          `(tenant.user_id = :scopeUserId OR LOWER(tenantUser.email) = :scopeEmail OR (:scopePhone <> '' AND tenantUser.phone = :scopePhone))`,
          {
            scopeUserId: user.id,
            scopeEmail: email,
            scopePhone: phone,
          },
        );
    }
  }

  private async resolveOwnerForCreate(
    ownerId: string | undefined,
    user: UserContext,
  ): Promise<Owner> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    if (ownerId) {
      const selectedOwner = await this.ownersRepository.findOne({
        where: { id: ownerId, companyId: user.companyId, deletedAt: IsNull() },
      });
      if (!selectedOwner) {
        throw new NotFoundException('Owner not found for this company');
      }

      if (user.role !== 'admin' && selectedOwner.userId !== user.id) {
        throw new ForbiddenException(
          'You can only create properties for your own owner profile',
        );
      }
      return selectedOwner;
    }

    const ownerByUser = await this.ownersRepository.findOne({
      where: {
        userId: user.id,
        companyId: user.companyId,
        deletedAt: IsNull(),
      },
    });

    if (ownerByUser) {
      return ownerByUser;
    }

    if (user.role === 'admin') {
      throw new BadRequestException(
        'ownerId is required for admin users when creating properties',
      );
    }

    throw new NotFoundException(
      'Owner profile for current user was not found in this company',
    );
  }

  private normalizePropertyImages(images?: string[]): string[] {
    if (!Array.isArray(images)) {
      return [];
    }

    return Array.from(
      new Set(
        images
          .map((imageRef) => this.toPropertyImageRelativeUrl(imageRef))
          .filter((imageRef): imageRef is string => Boolean(imageRef)),
      ),
    );
  }

  private async ensureUsablePropertyImageIds(
    imageRefs: string[],
    companyId: string,
    currentPropertyId?: string,
  ): Promise<string[]> {
    const imageIds = Array.from(
      new Set(
        imageRefs
          .map((imageRef) => this.toPropertyImageId(imageRef))
          .filter((imageId): imageId is string => Boolean(imageId)),
      ),
    );

    if (imageIds.length === 0) {
      return [];
    }

    const images = await this.propertyImagesRepository.find({
      where: {
        id: In(imageIds),
        companyId,
      },
      select: {
        id: true,
        propertyId: true,
      },
    });

    if (images.length !== imageIds.length) {
      throw new BadRequestException('Some property images are invalid');
    }

    const invalidImage = images.find((image) => {
      if (!image.propertyId) {
        return false;
      }
      return currentPropertyId ? image.propertyId !== currentPropertyId : true;
    });

    if (invalidImage) {
      throw new BadRequestException(
        'One or more images are already assigned to another property',
      );
    }

    return imageIds;
  }

  private async attachPropertyImagesToProperty(
    imageIds: string[],
    propertyId: string,
    companyId: string,
  ): Promise<void> {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return;
    }

    await this.propertyImagesRepository
      .createQueryBuilder()
      .update(PropertyImage)
      .set({
        propertyId,
        isTemporary: false,
      })
      .where('id IN (:...imageIds)', { imageIds })
      .andWhere('company_id = :companyId', { companyId })
      .execute();
  }

  private findRemovedImageRefs(
    previousImageRefs: string[],
    nextImageRefs: string[],
  ): string[] {
    const normalizedNextRefs = new Set(
      this.normalizePropertyImages(nextImageRefs),
    );

    return this.normalizePropertyImages(previousImageRefs).filter(
      (imageRef) => !normalizedNextRefs.has(imageRef),
    );
  }

  private async deleteTemporaryPropertyImages(
    imageRefs: string[],
    companyId: string,
  ): Promise<number> {
    if (!Array.isArray(imageRefs) || imageRefs.length === 0) {
      return 0;
    }

    const imageIds = Array.from(
      new Set(
        imageRefs
          .map((imageRef) => this.toPropertyImageId(imageRef))
          .filter((imageId): imageId is string => Boolean(imageId)),
      ),
    );

    let deletedCount = 0;

    if (imageIds.length > 0) {
      const deleteResult = await this.propertyImagesRepository
        .createQueryBuilder()
        .delete()
        .from(PropertyImage)
        .where('id IN (:...imageIds)', { imageIds })
        .andWhere('company_id = :companyId', { companyId })
        .andWhere('is_temporary = true')
        .andWhere('property_id IS NULL')
        .execute();

      deletedCount += deleteResult.affected ?? 0;
    }

    deletedCount += this.deleteLegacyPropertyImagesFromDisk(imageRefs);

    return deletedCount;
  }

  private async deletePropertyImages(
    imageRefs: string[],
    companyId?: string,
  ): Promise<number> {
    if (!Array.isArray(imageRefs) || imageRefs.length === 0) {
      return 0;
    }

    const imageIds = Array.from(
      new Set(
        imageRefs
          .map((imageRef) => this.toPropertyImageId(imageRef))
          .filter((imageId): imageId is string => Boolean(imageId)),
      ),
    );

    let deletedCount = 0;

    if (imageIds.length > 0) {
      const queryBuilder = this.propertyImagesRepository
        .createQueryBuilder()
        .delete()
        .from(PropertyImage)
        .where('id IN (:...imageIds)', { imageIds });

      if (companyId) {
        queryBuilder.andWhere('company_id = :companyId', { companyId });
      }

      const deleteResult = await queryBuilder.execute();
      deletedCount += deleteResult.affected ?? 0;
    }

    deletedCount += this.deleteLegacyPropertyImagesFromDisk(imageRefs);

    return deletedCount;
  }

  private deleteLegacyPropertyImagesFromDisk(imageRefs: string[]): number {
    let deletedCount = 0;

    for (const imageRef of imageRefs) {
      const fileName = this.toPropertyImageFileName(imageRef);
      if (!fileName) {
        continue;
      }

      const filePath = join(process.cwd(), 'uploads', 'properties', fileName);
      if (!existsSync(filePath)) {
        continue;
      }

      try {
        unlinkSync(filePath);
        deletedCount += 1;
      } catch {
        continue;
      }
    }

    return deletedCount;
  }

  private toPropertyImageRelativeUrl(imageRef: string): string | null {
    const imageId = this.toPropertyImageId(imageRef);
    if (imageId) {
      return `/properties/images/${imageId}`;
    }

    const fileName = this.toPropertyImageFileName(imageRef);
    if (!fileName) {
      return null;
    }

    return `/uploads/properties/${fileName}`;
  }

  private toPropertyImageId(imageRef: string): string | null {
    if (!imageRef || typeof imageRef !== 'string') {
      return null;
    }

    let pathname = imageRef.trim();
    if (!pathname) {
      return null;
    }

    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      try {
        const parsed = new URL(pathname);
        pathname = parsed.pathname;
      } catch {
        return null;
      }
    }

    const imagePathPrefix = '/properties/images/';
    const prefixIndex = pathname.indexOf(imagePathPrefix);
    if (prefixIndex === -1) {
      return null;
    }

    const imageId = pathname
      .slice(prefixIndex + imagePathPrefix.length)
      .split('?')[0]
      .split('/')[0]
      .trim();

    if (!PropertiesService.PROPERTY_IMAGE_ID_REGEX.test(imageId)) {
      return null;
    }

    return imageId;
  }

  private toPropertyImageFileName(imageRef: string): string | null {
    if (!imageRef || typeof imageRef !== 'string') {
      return null;
    }

    let pathname = imageRef.trim();
    if (!pathname) {
      return null;
    }

    if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
      try {
        const parsed = new URL(pathname);
        pathname = parsed.pathname;
      } catch {
        return null;
      }
    }

    const uploadPathPrefix = '/uploads/properties/';
    const prefixIndex = pathname.indexOf(uploadPathPrefix);
    if (prefixIndex === -1) {
      return null;
    }

    const fileName = decodeURIComponent(
      pathname.slice(prefixIndex + uploadPathPrefix.length),
    );
    if (
      !fileName ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('..')
    ) {
      return null;
    }

    return fileName;
  }
}
