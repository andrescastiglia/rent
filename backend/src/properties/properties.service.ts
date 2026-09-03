import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Property } from './entities/property.entity';
import { PropertyImage } from './entities/property-image.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyFiltersDto } from './dto/property-filters.dto';
import { Owner } from '../owners/entities/owner.entity';
import { ContractType, LeaseStatus } from '../leases/entities/lease.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  hasRole,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

interface UserContext {
  id: string;
  role: string;
  roles?: UserRole[];
  companyId?: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class PropertiesService {
  private static readonly MAX_PROPERTY_IMAGE_BYTES = 5 * 1024 * 1024;
  private static readonly TEMPORARY_IMAGE_URL_TTL_SECONDS = 15 * 60;
  private static readonly ALLOWED_PROPERTY_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  private static readonly PROPERTY_IMAGE_ID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(PropertyImage)
    private readonly propertyImagesRepository: Repository<PropertyImage>,
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
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
      undefined,
      this.isScopedOwner(user) ? user.id : undefined,
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
      this.isScopedOwner(user) ? user.id : undefined,
    );

    return createdProperty;
  }

  async findAll(
    filters: PropertyFiltersDto,
    user: UserContext,
  ): Promise<{ data: Property[]; total: number; page: number; limit: number }> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
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

    this.applyGeneralPropertyFilters(query, {
      companyId: user.companyId,
      ownerId,
      addressCity,
      addressState,
      propertyType,
      status,
    });
    this.applyUnitBasedFilters(query, {
      minRent,
      maxRent,
      minSalePrice,
      maxSalePrice,
      bedrooms,
      bathrooms,
    });

    this.applyVisibilityScope(query, user);

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  private applyGeneralPropertyFilters(
    query: SelectQueryBuilder<Property>,
    filters: {
      companyId?: string;
      ownerId?: string;
      addressCity?: string;
      addressState?: string;
      propertyType?: Property['propertyType'];
      status?: Property['status'];
    },
  ): void {
    if (filters.companyId) {
      query.andWhere('property.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.ownerId) {
      query.andWhere('property.owner_id = :ownerId', {
        ownerId: filters.ownerId,
      });
    }

    if (filters.addressCity) {
      query.andWhere('property.address_city ILIKE :addressCity', {
        addressCity: `%${filters.addressCity}%`,
      });
    }

    if (filters.addressState) {
      query.andWhere('property.address_state ILIKE :addressState', {
        addressState: `%${filters.addressState}%`,
      });
    }

    if (filters.propertyType) {
      query.andWhere('property.property_type = :propertyType', {
        propertyType: filters.propertyType,
      });
    }

    if (filters.status) {
      query.andWhere('property.status = :status', {
        status: filters.status,
      });
    }
  }

  private applyUnitBasedFilters(
    query: SelectQueryBuilder<Property>,
    filters: {
      minRent?: number;
      maxRent?: number;
      minSalePrice?: number;
      maxSalePrice?: number;
      bedrooms?: number;
      bathrooms?: number;
    },
  ): void {
    if (filters.minRent !== undefined) {
      query.andWhere(
        '(property.rent_price >= :minRent OR units.base_rent >= :minRent)',
        { minRent: filters.minRent },
      );
    }
    if (filters.maxRent !== undefined) {
      query.andWhere(
        '(property.rent_price <= :maxRent OR units.base_rent <= :maxRent)',
        { maxRent: filters.maxRent },
      );
    }
    if (filters.minSalePrice !== undefined) {
      query.andWhere('property.sale_price >= :minSalePrice', {
        minSalePrice: filters.minSalePrice,
      });
    }
    if (filters.maxSalePrice !== undefined) {
      query.andWhere('property.sale_price <= :maxSalePrice', {
        maxSalePrice: filters.maxSalePrice,
      });
    }
    if (filters.bedrooms !== undefined) {
      query.andWhere('units.bedrooms = :bedrooms', {
        bedrooms: filters.bedrooms,
      });
    }
    if (filters.bathrooms !== undefined) {
      query.andWhere('units.bathrooms = :bathrooms', {
        bathrooms: filters.bathrooms,
      });
    }
  }

  async findOneScoped(id: string, user: UserContext): Promise<Property> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }
    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.units', 'units')
      .leftJoinAndSelect('property.features', 'features')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .leftJoinAndSelect('property.company', 'company')
      .where('property.id = :id', { id })
      .andWhere('property.deleted_at IS NULL');

    query.andWhere('property.company_id = :companyId', {
      companyId: user.companyId,
    });

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
    user: UserContext,
  ): Promise<Property> {
    const property = await this.findOneScoped(id, user);
    const previousImageRefs = this.normalizePropertyImages(
      Array.isArray(property.images) ? property.images : [],
    );

    let nextImageIds: string[] = [];
    if (updatePropertyDto.images !== undefined) {
      updatePropertyDto.images = this.normalizePropertyImages(
        updatePropertyDto.images,
      );
      nextImageIds = await this.ensureUsablePropertyImageIds(
        updatePropertyDto.images,
        property.companyId,
        property.id,
        this.isScopedOwner(user) ? user.id : undefined,
      );
    }

    Object.assign(property, updatePropertyDto);
    const updatedProperty = await this.propertiesRepository.save(property);

    if (updatePropertyDto.images !== undefined) {
      await this.attachPropertyImagesToProperty(
        nextImageIds,
        property.id,
        property.companyId,
        this.isScopedOwner(user) ? user.id : undefined,
      );
      const removedImageRefs = this.findRemovedImageRefs(
        previousImageRefs,
        updatePropertyDto.images,
      );
      await this.deletePropertyImages(removedImageRefs, property.companyId);
    }

    return updatedProperty;
  }

  async remove(id: string, user: UserContext): Promise<void> {
    const property = await this.findOneScoped(id, user);

    // Check if property has occupied units
    const occupiedUnits = await this.unitsRepository.count({
      where: {
        propertyId: id,
        companyId: property.companyId,
        status: UnitStatus.OCCUPIED,
        deletedAt: IsNull(),
      },
    });

    if (occupiedUnits > 0) {
      throw new BadRequestException(
        'Cannot delete property with occupied units',
      );
    }

    await this.propertiesRepository.softDelete({
      id,
      companyId: property.companyId,
    });
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
      this.isScopedOwner(user) ? user.id : undefined,
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
    if (!file?.buffer) {
      throw new BadRequestException('File is required');
    }
    const mimeType = String(file.mimetype ?? '').toLowerCase();
    if (!PropertiesService.ALLOWED_PROPERTY_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are allowed',
      );
    }
    if (
      file.buffer.length === 0 ||
      file.buffer.length > PropertiesService.MAX_PROPERTY_IMAGE_BYTES
    ) {
      throw new BadRequestException('Image must not exceed 5 MiB');
    }
    if (!this.bufferMatchesImageMimeType(file.buffer, mimeType)) {
      throw new BadRequestException(
        'Image content does not match its MIME type',
      );
    }

    const savedImage = await this.propertyImagesRepository.save(
      this.propertyImagesRepository.create({
        companyId: user.companyId,
        uploadedByUserId: user.id,
        originalName: file.originalname ?? null,
        mimeType,
        sizeBytes: file.buffer.length,
        data: file.buffer,
        isTemporary: true,
      }),
    );

    return { url: this.createTemporaryPropertyImageUrl(savedImage.id) };
  }

  async getPropertyImage(
    imageId: string,
    expires?: string,
    signature?: string,
  ): Promise<PropertyImage> {
    const image = await this.propertyImagesRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException(
        `Property image with ID ${imageId} not found`,
      );
    }

    if (
      image.isTemporary &&
      !this.isValidTemporaryPropertyImageSignature(imageId, expires, signature)
    ) {
      throw new NotFoundException(
        `Property image with ID ${imageId} not found`,
      );
    }

    return image;
  }

  private bufferMatchesImageMimeType(
    buffer: Buffer,
    mimeType: string,
  ): boolean {
    if (mimeType === 'image/jpeg') {
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    }
    if (mimeType === 'image/png') {
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  private createTemporaryPropertyImageUrl(imageId: string): string {
    const expires =
      Math.floor(Date.now() / 1000) +
      PropertiesService.TEMPORARY_IMAGE_URL_TTL_SECONDS;
    const signature = this.signTemporaryPropertyImage(imageId, expires);
    return `/properties/images/${imageId}?expires=${expires}&signature=${signature}`;
  }

  private isValidTemporaryPropertyImageSignature(
    imageId: string,
    expires?: string,
    signature?: string,
  ): boolean {
    if (!expires || !signature || !/^\d+$/.test(expires)) {
      return false;
    }
    const expiresAt = Number(expires);
    if (
      !Number.isSafeInteger(expiresAt) ||
      expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return false;
    }

    const expected = this.signTemporaryPropertyImage(imageId, expiresAt);
    if (!/^[0-9a-f]{64}$/.test(signature)) {
      return false;
    }
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  private signTemporaryPropertyImage(imageId: string, expires: number): string {
    const secret = (
      process.env.PROPERTY_IMAGE_SIGNING_SECRET ?? process.env.JWT_SECRET
    )?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'Property image signing secret is not configured',
      );
    }
    return createHmac('sha256', secret)
      .update(`property-image:${imageId}:${expires}`)
      .digest('hex');
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<Property>,
    user: UserContext,
  ) {
    if (isAdminOrStaff(user)) {
      return;
    }

    const roles = getUserRoles(user);
    const scopes = [
      roles.includes(UserRole.OWNER) ? 'owner.user_id = :scopeUserId' : null,
      roles.includes(UserRole.TENANT)
        ? `EXISTS (
            SELECT 1 FROM leases tenant_lease
            JOIN tenants scope_tenant ON scope_tenant.id = tenant_lease.tenant_id
            WHERE tenant_lease.property_id = property.id
              AND tenant_lease.contract_type = :rentalType
              AND tenant_lease.status = :activeStatus
              AND tenant_lease.deleted_at IS NULL
              AND scope_tenant.deleted_at IS NULL
              AND scope_tenant.user_id = :scopeUserId
          )`
        : null,
      roles.includes(UserRole.BUYER)
        ? `EXISTS (
            SELECT 1 FROM leases sale_contract
            JOIN buyers scope_buyer ON scope_buyer.id = sale_contract.buyer_id
            WHERE sale_contract.property_id = property.id
              AND sale_contract.contract_type = :saleType
              AND sale_contract.deleted_at IS NULL
              AND scope_buyer.deleted_at IS NULL
              AND scope_buyer.user_id = :scopeUserId
          )`
        : null,
    ].filter((scope): scope is string => Boolean(scope));

    if (scopes.length > 0) {
      query.andWhere(`(${scopes.join(' OR ')})`, {
        scopeUserId: user.id,
        rentalType: ContractType.RENTAL,
        saleType: ContractType.SALE,
        activeStatus: LeaseStatus.ACTIVE,
      });
      return;
    }

    throw new ForbiddenException('Property access is not allowed');
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

      if (!isAdminOrStaff(user) && selectedOwner.userId !== user.id) {
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

    if (isAdminOrStaff(user)) {
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
    uploadedByUserId?: string,
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
        uploadedByUserId: true,
      },
    });

    if (images.length !== imageIds.length) {
      throw new BadRequestException('Some property images are invalid');
    }

    if (
      uploadedByUserId &&
      images.some((image) => image.uploadedByUserId !== uploadedByUserId)
    ) {
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
    uploadedByUserId?: string,
  ): Promise<void> {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return;
    }

    const query = this.propertyImagesRepository
      .createQueryBuilder()
      .update(PropertyImage)
      .set({
        propertyId,
        isTemporary: false,
      })
      .where('id IN (:...imageIds)', { imageIds })
      .andWhere('company_id = :companyId', { companyId })
      .andWhere('(property_id IS NULL OR property_id = :propertyId)', {
        propertyId,
      });
    if (uploadedByUserId) {
      query.andWhere('uploaded_by_user_id = :uploadedByUserId', {
        uploadedByUserId,
      });
    }
    await query.execute();
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
    uploadedByUserId?: string,
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

    if (imageIds.length === 0) {
      return 0;
    }

    const query = this.propertyImagesRepository
      .createQueryBuilder()
      .delete()
      .from(PropertyImage)
      .where('id IN (:...imageIds)', { imageIds })
      .andWhere('company_id = :companyId', { companyId })
      .andWhere('is_temporary = true')
      .andWhere('property_id IS NULL');
    if (uploadedByUserId) {
      query.andWhere('uploaded_by_user_id = :uploadedByUserId', {
        uploadedByUserId,
      });
    }
    const deleteResult = await query.execute();

    return deleteResult.affected ?? 0;
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

    if (imageIds.length === 0) {
      return 0;
    }

    const queryBuilder = this.propertyImagesRepository
      .createQueryBuilder()
      .delete()
      .from(PropertyImage)
      .where('id IN (:...imageIds)', { imageIds });

    if (companyId) {
      queryBuilder.andWhere('company_id = :companyId', { companyId });
    }

    const deleteResult = await queryBuilder.execute();
    return deleteResult.affected ?? 0;
  }

  private toPropertyImageRelativeUrl(imageRef: string): string | null {
    const imageId = this.toPropertyImageId(imageRef);
    if (imageId) {
      return `/properties/images/${imageId}`;
    }

    return null;
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

  private isScopedOwner(user: UserContext): boolean {
    return hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user);
  }
}
