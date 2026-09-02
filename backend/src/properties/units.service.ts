import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Unit } from './entities/unit.entity';
import { Property } from './entities/property.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UserRole } from '../users/entities/user.entity';

type UnitActor = {
  id: string;
  companyId: string;
  role: UserRole;
};

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async create(createUnitDto: CreateUnitDto, actor: UnitActor): Promise<Unit> {
    this.assertCanMutate(actor);
    const property = await this.findPropertyScoped(
      createUnitDto.propertyId,
      actor,
    );
    const unit = this.unitsRepository.create({
      ...createUnitDto,
      companyId: property.companyId,
    } as Partial<Unit>);
    return this.unitsRepository.save(unit);
  }

  async findByProperty(propertyId: string, actor: UnitActor): Promise<Unit[]> {
    await this.findPropertyScoped(propertyId, actor);
    return this.unitsRepository.find({
      where: { propertyId, companyId: actor.companyId, deletedAt: IsNull() },
      order: { unitNumber: 'ASC' },
    });
  }

  async findOne(id: string, actor: UnitActor): Promise<Unit> {
    const unit = await this.unitsRepository.findOne({
      where: { id, companyId: actor.companyId, deletedAt: IsNull() },
      relations: ['property'],
    });

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    await this.findPropertyScoped(unit.propertyId, actor);

    return unit;
  }

  async update(
    id: string,
    updateUnitDto: UpdateUnitDto,
    actor: UnitActor,
  ): Promise<Unit> {
    this.assertCanMutate(actor);
    const unit = await this.findOne(id, actor);
    Object.assign(unit, updateUnitDto);
    unit.companyId = actor.companyId;
    return this.unitsRepository.save(unit);
  }

  async remove(id: string, actor: UnitActor): Promise<void> {
    this.assertCanMutate(actor);
    await this.findOne(id, actor);
    await this.unitsRepository.softDelete(id);
  }

  private async findPropertyScoped(
    propertyId: string,
    actor: UnitActor,
  ): Promise<Property> {
    const query = this.propertiesRepository
      .createQueryBuilder('property')
      .where('property.id = :propertyId', { propertyId })
      .andWhere('property.company_id = :companyId', {
        companyId: actor.companyId,
      })
      .andWhere('property.deleted_at IS NULL');
    if (actor.role === UserRole.OWNER) {
      query
        .innerJoin('property.owner', 'scopeOwner')
        .andWhere('scopeOwner.user_id = :actorId', { actorId: actor.id });
    } else if (actor.role === UserRole.TENANT) {
      query
        .innerJoin(
          'leases',
          'scopeLease',
          'scopeLease.property_id = property.id AND scopeLease.company_id = :companyId AND scopeLease.deleted_at IS NULL',
          { companyId: actor.companyId },
        )
        .innerJoin(
          'tenants',
          'scopeTenant',
          'scopeTenant.id = scopeLease.tenant_id AND scopeTenant.user_id = :actorId AND scopeTenant.company_id = :companyId AND scopeTenant.deleted_at IS NULL',
          { actorId: actor.id, companyId: actor.companyId },
        );
    } else if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.STAFF) {
      throw new ForbiddenException('Unit access is not allowed');
    }
    const property = await query.getOne();
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }
    return property;
  }

  private assertCanMutate(actor: UnitActor): void {
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.OWNER) {
      throw new ForbiddenException('Unit management is not allowed');
    }
  }
}
