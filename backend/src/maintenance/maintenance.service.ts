import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import {
  MaintenanceTicket,
  MaintenanceTicketSource,
  MaintenanceTicketStatus,
} from './entities/maintenance-ticket.entity';
import { MaintenanceTicketComment } from './entities/maintenance-ticket-comment.entity';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { MaintenanceTicketFiltersDto } from './dto/maintenance-ticket-filters.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PropertiesService } from '../properties/properties.service';
import { ContractType, LeaseStatus } from '../leases/entities/lease.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

export interface MaintenanceActor {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
}

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceTicket)
    private readonly ticketRepository: Repository<MaintenanceTicket>,
    @InjectRepository(MaintenanceTicketComment)
    private readonly commentRepository: Repository<MaintenanceTicketComment>,
    private readonly propertiesService: PropertiesService,
  ) {}

  async findAll(
    actor: MaintenanceActor,
    filters: MaintenanceTicketFiltersDto,
  ): Promise<MaintenanceTicket[]> {
    const qb = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.property', 'property')
      .leftJoinAndSelect('ticket.assignedStaff', 'assignedStaff')
      .leftJoinAndSelect('assignedStaff.user', 'staffUser')
      .leftJoinAndSelect('ticket.reportedBy', 'reportedBy')
      .where('ticket.company_id = :companyId', {
        companyId: actor.companyId,
      })
      .andWhere('ticket.deleted_at IS NULL');

    this.applyActorScope(qb, actor);

    if (filters.propertyId) {
      qb.andWhere('ticket.property_id = :propertyId', {
        propertyId: filters.propertyId,
      });
    }

    if (filters.status) {
      qb.andWhere('ticket.status = :status', { status: filters.status });
    }

    if (filters.priority) {
      qb.andWhere('ticket.priority = :priority', {
        priority: filters.priority,
      });
    }

    if (filters.assignedToStaffId) {
      qb.andWhere('ticket.assigned_to_staff_id = :assignedToStaffId', {
        assignedToStaffId: filters.assignedToStaffId,
      });
    }

    if (filters.search) {
      const search = `%${filters.search.toLowerCase()}%`;
      qb.andWhere('LOWER(ticket.title) LIKE :search', { search });
    }

    return qb.orderBy('ticket.created_at', 'DESC').getMany();
  }

  async findOne(
    id: string,
    actor: MaintenanceActor,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id, companyId: actor.companyId, deletedAt: IsNull() },
      relations: [
        'property',
        'assignedStaff',
        'assignedStaff.user',
        'reportedBy',
        'comments',
        'comments.user',
      ],
    });

    if (!ticket) {
      throw new NotFoundException(`Maintenance ticket with ID ${id} not found`);
    }

    await this.propertiesService.findOneScoped(ticket.propertyId, actor);
    return ticket;
  }

  async create(
    actor: MaintenanceActor,
    dto: CreateMaintenanceTicketDto,
  ): Promise<MaintenanceTicket> {
    await this.propertiesService.findOneScoped(dto.propertyId, actor);

    const ticket = this.ticketRepository.create({
      companyId: actor.companyId,
      reportedByUserId: actor.id,
      propertyId: dto.propertyId,
      title: dto.title,
      description: dto.description ?? null,
      area: dto.area,
      priority: dto.priority,
      source: this.resolveTicketSource(actor, dto.source),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      estimatedCost: dto.estimatedCost ?? null,
      costCurrency: dto.costCurrency ?? 'ARS',
      status: MaintenanceTicketStatus.OPEN,
    });

    const saved = await this.ticketRepository.save(ticket);
    return this.findOne(saved.id, actor);
  }

  async update(
    id: string,
    actor: MaintenanceActor,
    dto: UpdateMaintenanceTicketDto,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.findOne(id, actor);

    this.applyScalarFields(ticket, dto);
    this.applyAssignmentUpdate(ticket, dto);
    this.applyStatusUpdate(ticket, dto);

    if (dto.resolvedAt !== undefined)
      ticket.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;

    await this.ticketRepository.save(ticket);
    return this.findOne(id, actor);
  }

  private applyScalarFields(
    ticket: MaintenanceTicket,
    dto: UpdateMaintenanceTicketDto,
  ): void {
    if (dto.title !== undefined) ticket.title = dto.title;
    if (dto.description !== undefined)
      ticket.description = dto.description ?? null;
    if (dto.area !== undefined) ticket.area = dto.area!;
    if (dto.priority !== undefined) ticket.priority = dto.priority!;
    if (dto.source !== undefined) ticket.source = dto.source!;
    if (dto.scheduledAt !== undefined)
      ticket.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (dto.estimatedCost !== undefined)
      ticket.estimatedCost = dto.estimatedCost ?? null;
    if (dto.costCurrency !== undefined)
      ticket.costCurrency = dto.costCurrency ?? 'ARS';
    if (dto.externalRef !== undefined)
      ticket.externalRef = dto.externalRef ?? null;
    if (dto.resolutionNotes !== undefined)
      ticket.resolutionNotes = dto.resolutionNotes ?? null;
    if (dto.actualCost !== undefined)
      ticket.actualCost = dto.actualCost ?? null;
  }

  private applyAssignmentUpdate(
    ticket: MaintenanceTicket,
    dto: UpdateMaintenanceTicketDto,
  ): void {
    if (dto.assignedToStaffId === undefined) return;
    ticket.assignedToStaffId = dto.assignedToStaffId ?? null;
    if (dto.assignedToStaffId) {
      ticket.assignedAt = new Date();
      if (ticket.status === MaintenanceTicketStatus.OPEN) {
        ticket.status = MaintenanceTicketStatus.ASSIGNED;
      }
    }
  }

  private applyStatusUpdate(
    ticket: MaintenanceTicket,
    dto: UpdateMaintenanceTicketDto,
  ): void {
    if (dto.status === undefined) return;
    ticket.status = dto.status;
    if (dto.status === MaintenanceTicketStatus.RESOLVED && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
    }
  }

  async remove(id: string, actor: MaintenanceActor): Promise<void> {
    const ticket = await this.findOne(id, actor);
    await this.ticketRepository.softDelete(ticket.id);
  }

  async addComment(
    ticketId: string,
    actor: MaintenanceActor,
    dto: CreateCommentDto,
  ): Promise<MaintenanceTicketComment> {
    await this.findOne(ticketId, actor);

    const comment = this.commentRepository.create({
      ticketId,
      userId: actor.id,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
    });

    return this.commentRepository.save(comment);
  }

  async getComments(
    ticketId: string,
    actor: MaintenanceActor,
    isAdminOrStaff: boolean,
  ): Promise<MaintenanceTicketComment[]> {
    await this.findOne(ticketId, actor);

    const qb = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.ticket_id = :ticketId', { ticketId });

    if (!isAdminOrStaff) {
      qb.andWhere('comment.is_internal = false');
    }

    return qb.orderBy('comment.created_at', 'ASC').getMany();
  }

  private applyActorScope(
    query: SelectQueryBuilder<MaintenanceTicket>,
    actor: MaintenanceActor,
  ): void {
    if (isAdminOrStaff(actor)) {
      return;
    }

    const roles = getUserRoles(actor);
    const scopes = [
      roles.includes(UserRole.OWNER)
        ? `EXISTS (SELECT 1 FROM owners scope_owner
            WHERE scope_owner.id = property.owner_id
              AND scope_owner.user_id = :actorId
              AND scope_owner.deleted_at IS NULL)`
        : null,
      roles.includes(UserRole.TENANT)
        ? `EXISTS (SELECT 1 FROM leases scope_lease
            JOIN tenants scope_tenant ON scope_tenant.id = scope_lease.tenant_id
            WHERE scope_lease.property_id = ticket.property_id
              AND scope_lease.company_id = :companyId
              AND scope_lease.contract_type = :rentalType
              AND scope_lease.status = :activeStatus
              AND scope_lease.deleted_at IS NULL
              AND scope_tenant.user_id = :actorId
              AND scope_tenant.company_id = :companyId
              AND scope_tenant.deleted_at IS NULL)`
        : null,
    ].filter((scope): scope is string => Boolean(scope));
    if (scopes.length > 0) {
      query.andWhere(`(${scopes.join(' OR ')})`, {
        actorId: actor.id,
        companyId: actor.companyId,
        rentalType: ContractType.RENTAL,
        activeStatus: LeaseStatus.ACTIVE,
      });
      return;
    }

    throw new ForbiddenException('Maintenance ticket access is not allowed');
  }

  private resolveTicketSource(
    actor: MaintenanceActor,
    requestedSource?: MaintenanceTicketSource,
  ): MaintenanceTicketSource {
    if (
      requestedSource === MaintenanceTicketSource.INSPECTION &&
      isAdminOrStaff(actor)
    ) {
      return MaintenanceTicketSource.INSPECTION;
    }

    const sourceByRole: Partial<Record<UserRole, MaintenanceTicketSource>> = {
      [UserRole.ADMIN]: MaintenanceTicketSource.ADMIN,
      [UserRole.STAFF]: MaintenanceTicketSource.STAFF,
      [UserRole.OWNER]: MaintenanceTicketSource.OWNER,
      [UserRole.TENANT]: MaintenanceTicketSource.TENANT,
    };
    const roles = getUserRoles(actor);
    const role = [
      UserRole.ADMIN,
      UserRole.STAFF,
      UserRole.OWNER,
      UserRole.TENANT,
    ].find((candidate) => roles.includes(candidate));
    const source = role ? sourceByRole[role] : undefined;
    if (!source) {
      throw new ForbiddenException(
        'Maintenance ticket creation is not allowed',
      );
    }
    return source;
  }
}
