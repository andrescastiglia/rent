import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InterestedProfile, InterestedOperation, InterestedPropertyType } from './entities/interested-profile.entity';
import { CreateInterestedProfileDto } from './dto/create-interested-profile.dto';
import { UpdateInterestedProfileDto } from './dto/update-interested-profile.dto';
import { InterestedFiltersDto } from './dto/interested-filters.dto';
import { Property, PropertyType, PropertyStatus } from '../properties/entities/property.entity';
import { UnitStatus } from '../properties/entities/unit.entity';

interface UserContext {
  id: string;
  role: string;
  companyId?: string;
}

@Injectable()
export class InterestedService {
  constructor(
    @InjectRepository(InterestedProfile)
    private readonly interestedRepository: Repository<InterestedProfile>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async create(
    dto: CreateInterestedProfileDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const profile = this.interestedRepository.create({
      ...dto,
      companyId: user.companyId,
    });
    return this.interestedRepository.save(profile);
  }

  async findAll(
    filters: InterestedFiltersDto,
    user: UserContext,
  ): Promise<{ data: InterestedProfile[]; total: number; page: number; limit: number }> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const { name, phone, operation, propertyTypePreference, page = 1, limit = 10 } = filters;

    const query = this.interestedRepository
      .createQueryBuilder('interested')
      .where('interested.deleted_at IS NULL')
      .andWhere('interested.company_id = :companyId', { companyId: user.companyId });

    if (name) {
      query.andWhere(
        "(interested.first_name ILIKE :name OR interested.last_name ILIKE :name)",
        { name: `%${name}%` },
      );
    }

    if (phone) {
      query.andWhere('interested.phone ILIKE :phone', { phone: `%${phone}%` });
    }

    if (operation) {
      query.andWhere('interested.operation = :operation', { operation });
    }

    if (propertyTypePreference) {
      query.andWhere('interested.property_type_preference = :propertyTypePreference', {
        propertyTypePreference,
      });
    }

    query.orderBy('interested.created_at', 'DESC').skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, user: UserContext): Promise<InterestedProfile> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const profile = await this.interestedRepository.findOne({
      where: { id, companyId: user.companyId, deletedAt: IsNull() },
    });

    if (!profile) {
      throw new NotFoundException(`Interested profile with ID ${id} not found`);
    }

    return profile;
  }

  async update(
    id: string,
    dto: UpdateInterestedProfileDto,
    user: UserContext,
  ): Promise<InterestedProfile> {
    const profile = await this.findOne(id, user);
    Object.assign(profile, dto);
    return this.interestedRepository.save(profile);
  }

  async remove(id: string, user: UserContext): Promise<void> {
    const profile = await this.findOne(id, user);
    await this.interestedRepository.softDelete(profile.id);
  }

  async findMatches(id: string, user: UserContext): Promise<Property[]> {
    const profile = await this.findOne(id, user);

    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.units', 'units')
      .where('property.deleted_at IS NULL')
      .andWhere('property.company_id = :companyId', { companyId: profile.companyId })
      .andWhere('property.status = :status', { status: PropertyStatus.ACTIVE });

    const propertyType = this.mapPreferenceToPropertyType(
      profile.propertyTypePreference,
    );
    if (propertyType) {
      query.andWhere('property.property_type = :propertyType', { propertyType });
    }

    if (profile.operation === InterestedOperation.RENT) {
      query.andWhere('units.status = :unitStatus', { unitStatus: UnitStatus.AVAILABLE });
      query.andWhere('units.base_rent IS NOT NULL');
      if (profile.maxAmount !== null && profile.maxAmount !== undefined) {
        query.andWhere('units.base_rent <= :maxAmount', { maxAmount: profile.maxAmount });
      }
    }

    if (profile.operation === InterestedOperation.SALE) {
      query.andWhere('property.sale_price IS NOT NULL');
      if (profile.maxAmount !== null && profile.maxAmount !== undefined) {
        query.andWhere('property.sale_price <= :maxAmount', { maxAmount: profile.maxAmount });
      }
    }

    if (profile.peopleCount !== null && profile.peopleCount !== undefined) {
      query.andWhere(
        '(property.max_occupants IS NULL OR property.max_occupants >= :peopleCount)',
        { peopleCount: profile.peopleCount },
      );
    }

    if (profile.hasPets) {
      query.andWhere('property.allows_pets = TRUE');
    }

    if (profile.whiteIncome === false) {
      query.andWhere(
        '(property.requires_white_income = FALSE OR property.requires_white_income IS NULL)',
      );
    }

    if (profile.guaranteeTypes && profile.guaranteeTypes.length > 0) {
      query.andWhere(
        '(property.accepted_guarantee_types IS NULL OR array_length(property.accepted_guarantee_types, 1) = 0 OR property.accepted_guarantee_types && :guaranteeTypes)',
        { guaranteeTypes: profile.guaranteeTypes },
      );
    }

    const properties = await query.getMany();
    return properties;
  }

  private mapPreferenceToPropertyType(
    preference?: InterestedPropertyType,
  ): PropertyType | null {
    if (!preference) return null;
    if (preference === InterestedPropertyType.APARTMENT) return PropertyType.APARTMENT;
    if (preference === InterestedPropertyType.HOUSE) return PropertyType.HOUSE;
    return null;
  }
}
