import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { Unit, UnitStatus } from './entities/unit.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyFiltersDto } from './dto/property-filters.dto';
import { Owner } from '../owners/entities/owner.entity';

interface UserContext {
  id: string;
  role: string;
  companyId?: string;
}

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private propertiesRepository: Repository<Property>,
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

    const property = this.propertiesRepository.create({
      ...createPropertyDto,
      companyId: user.companyId,
      ownerId: owner.id,
    });
    return this.propertiesRepository.save(property);
  }

  async findAll(
    filters: PropertyFiltersDto,
  ): Promise<{ data: Property[]; total: number; page: number; limit: number }> {
    const {
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
      .where('property.deleted_at IS NULL');

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
        query.andWhere('units.base_rent >= :minRent', { minRent });
      }
      if (maxRent !== undefined) {
        query.andWhere('units.base_rent <= :maxRent', { maxRent });
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
      relations: ['units', 'features', 'owner', 'company'],
    });

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

    // Check ownership (only owner or admin can update)
    // property.owner is loaded via relation and has userId
    if (userRole !== 'admin' && property.owner?.userId !== userId) {
      throw new ForbiddenException('You can only update your own properties');
    }

    Object.assign(property, updatePropertyDto);
    return this.propertiesRepository.save(property);
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
}
