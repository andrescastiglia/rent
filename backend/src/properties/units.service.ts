import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { Unit } from './entities/unit.entity';
import { Property } from './entities/property.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  hasAnyRole,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

type UnitActor = {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
};

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
  ) {}

  async create(
    createUnitDto: CreateUnitDto,
    actor: UnitActor,
    executionKey?: string,
  ): Promise<Unit> {
    this.assertCanMutate(actor);
    return this.unitsRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'unit.create',
        { ...createUnitDto, companyId: actor.companyId, actorId: actor.id },
        async () => {
          const property = await this.findPropertyScoped(
            createUnitDto.propertyId,
            actor,
            manager,
          );
          const repository = manager.getRepository(Unit);
          const unit = repository.create({
            ...createUnitDto,
            companyId: property.companyId,
          } as Partial<Unit>);
          return repository.save(unit);
        },
      ),
    );
  }

  async findByProperty(propertyId: string, actor: UnitActor): Promise<Unit[]> {
    await this.findPropertyScoped(propertyId, actor);
    return this.unitsRepository.find({
      where: { propertyId, companyId: actor.companyId, deletedAt: IsNull() },
      order: { unitNumber: 'ASC' },
    });
  }

  async findOne(
    id: string,
    actor: UnitActor,
    manager?: EntityManager,
  ): Promise<Unit> {
    if (!actor.companyId)
      throw new ForbiddenException('Company scope required');
    const unit = await (
      manager?.getRepository(Unit) ?? this.unitsRepository
    ).findOne({
      where: { id, companyId: actor.companyId, deletedAt: IsNull() },
      relations: ['property'],
    });

    if (!unit) {
      throw new NotFoundException(`Unit with ID ${id} not found`);
    }
    await this.findPropertyScoped(unit.propertyId, actor, manager);

    return unit;
  }

  async update(
    id: string,
    updateUnitDto: UpdateUnitDto,
    actor: UnitActor,
    executionKey?: string,
  ): Promise<Unit> {
    this.assertCanMutate(actor);
    if (
      Object.hasOwn(updateUnitDto, 'propertyId') ||
      Object.hasOwn(updateUnitDto, 'companyId')
    )
      throw new BadRequestException('Unit property and company are immutable');
    return this.unitsRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'unit.update',
        { id, ...updateUnitDto, actorId: actor.id },
        async () => {
          await manager.query(
            'SELECT id FROM units WHERE id=$1 AND company_id=$2 FOR UPDATE',
            [id, actor.companyId],
          );
          const unit = await this.findOne(id, actor, manager);
          Object.assign(unit, updateUnitDto);
          unit.companyId = actor.companyId;
          return manager.getRepository(Unit).save(unit);
        },
      ),
    );
  }

  async remove(
    id: string,
    actor: UnitActor,
    executionKey?: string,
  ): Promise<void> {
    this.assertCanMutate(actor);
    await this.unitsRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'unit.delete',
        { id, actorId: actor.id },
        async () => {
          await manager.query(
            'SELECT id FROM units WHERE id=$1 AND company_id=$2 FOR UPDATE',
            [id, actor.companyId],
          );
          await this.findOne(id, actor, manager);
          await manager
            .getRepository(Unit)
            .softDelete({ id, companyId: actor.companyId });
          return null;
        },
      ),
    );
  }

  private async findPropertyScoped(
    propertyId: string,
    actor: UnitActor,
    manager?: EntityManager,
  ): Promise<Property> {
    if (!actor.companyId)
      throw new ForbiddenException('Company scope required');
    const query = (
      manager?.getRepository(Property) ?? this.propertiesRepository
    )
      .createQueryBuilder('property')
      .where('property.id = :propertyId', { propertyId })
      .andWhere('property.company_id = :companyId', {
        companyId: actor.companyId,
      })
      .andWhere('property.deleted_at IS NULL');
    if (!isAdminOrStaff(actor)) {
      const roles = getUserRoles(actor);
      const scopes = [
        roles.includes(UserRole.OWNER)
          ? `EXISTS (SELECT 1 FROM owners scope_owner
              WHERE scope_owner.id = property.owner_id
                AND scope_owner.user_id = :actorId
                AND scope_owner.company_id = :companyId
                AND scope_owner.deleted_at IS NULL)`
          : null,
        roles.includes(UserRole.TENANT)
          ? `EXISTS (SELECT 1 FROM leases scope_lease
              JOIN tenants scope_tenant ON scope_tenant.id = scope_lease.tenant_id
              WHERE scope_lease.property_id = property.id
                AND scope_lease.company_id = :companyId
                AND scope_lease.contract_type = 'rental'
                AND scope_lease.status = 'active'
                AND scope_lease.deleted_at IS NULL
                AND scope_tenant.user_id = :actorId
                AND scope_tenant.company_id = :companyId
                AND scope_tenant.deleted_at IS NULL)`
          : null,
        roles.includes(UserRole.BUYER)
          ? `EXISTS (SELECT 1 FROM leases scope_sale
              JOIN buyers scope_buyer ON scope_buyer.id = scope_sale.buyer_id
              WHERE scope_sale.property_id = property.id
                AND scope_sale.company_id = :companyId
                AND scope_sale.contract_type = 'sale'
                AND scope_sale.deleted_at IS NULL
                AND scope_buyer.user_id = :actorId
                AND scope_buyer.company_id = :companyId
                AND scope_buyer.deleted_at IS NULL)`
          : null,
      ].filter((scope): scope is string => Boolean(scope));
      query.andWhere(scopes.length ? `(${scopes.join(' OR ')})` : 'FALSE', {
        actorId: actor.id,
        companyId: actor.companyId,
      });
    }
    const property = await query.getOne();
    if (!property) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }
    return property;
  }

  private assertCanMutate(actor: UnitActor): void {
    if (
      !actor.companyId ||
      !hasAnyRole(actor, [UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF])
    ) {
      throw new ForbiddenException('Unit management is not allowed');
    }
  }
}
