import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CommunicationsService } from '../communications/communications.service';
import {
  CommunicationChannel,
  CommunicationEvent,
} from '../communications/entities/communication-template.entity';
import { maintenanceNoticeRecipients } from './maintenance-notices';
import { EntityManager, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import { Staff } from '../staff/entities/staff.entity';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import {
  MaintenanceTicket,
  MaintenanceTicketArea,
  MaintenanceTicketPriority,
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
    private readonly communicationsService: CommunicationsService,
  ) {}

  async findAll(
    actor: MaintenanceActor,
    filters: MaintenanceTicketFiltersDto,
  ): Promise<MaintenanceTicket[]> {
    this.requireCompany(actor);
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

    const tickets = await qb.orderBy('ticket.created_at', 'DESC').getMany();
    if (!isAdminOrStaff(actor))
      for (const ticket of tickets) {
        ticket.metadata = null;
        ticket.externalRef = null;
      }
    return tickets;
  }

  async findOne(
    id: string,
    actor: MaintenanceActor,
    manager?: EntityManager,
  ): Promise<MaintenanceTicket> {
    this.requireCompany(actor);
    const ticket = await (
      manager?.getRepository(MaintenanceTicket) ?? this.ticketRepository
    ).findOne({
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
    if (!isAdminOrStaff(actor)) {
      ticket.comments = (ticket.comments ?? []).filter(
        (comment) => !comment.isInternal,
      );
      ticket.metadata = null;
      ticket.externalRef = null;
    }
    return ticket;
  }

  async create(
    actor: MaintenanceActor,
    dto: CreateMaintenanceTicketDto,
    executionKey?: string,
  ): Promise<MaintenanceTicket> {
    this.requireCompany(actor);
    await this.propertiesService.findOneScoped(dto.propertyId, actor);
    this.validateFields(dto);
    return this.ticketRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'maintenance.create',
        { actorId: actor.id, ...dto },
        async () => {
          const repository = manager.getRepository(MaintenanceTicket);
          const ticket = repository.create({
            companyId: actor.companyId,
            reportedByUserId: actor.id,
            propertyId: dto.propertyId,
            title: dto.title,
            description: dto.description ?? null,
            area: dto.area ?? MaintenanceTicketArea.OTHER,
            priority: dto.priority ?? MaintenanceTicketPriority.MEDIUM,
            source: this.resolveTicketSource(actor, dto.source),
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
            metadata: {
              agendaScheduleKind:
                typeof dto.scheduledAt === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(dto.scheduledAt)
                  ? 'date'
                  : 'time',
            },
            estimatedCost: dto.estimatedCost ?? null,
            costCurrency: dto.costCurrency ?? 'ARS',
            status: MaintenanceTicketStatus.OPEN,
          });

          const saved = await repository.save(ticket);
          await this.audit(manager, actor, saved, 'create', null);
          return this.findOne(saved.id, actor, manager);
        },
      ),
    );
  }

  async update(
    id: string,
    actor: MaintenanceActor,
    dto: UpdateMaintenanceTicketDto,
    executionKey?: string,
  ): Promise<MaintenanceTicket> {
    this.requireCompany(actor);
    if (!isAdminOrStaff(actor))
      throw new ForbiddenException(
        'Only staff or admin can update maintenance tickets',
      );
    this.validateFields(dto);
    return this.ticketRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'maintenance.update',
        { actorId: actor.id, id, ...dto },
        async () => {
          const repository = manager.getRepository(MaintenanceTicket);
          const ticket = await this.lockTicket(manager, id, actor);
          if (
            dto.propertyId !== undefined &&
            dto.propertyId !== ticket.propertyId
          )
            throw new BadRequestException(
              'A maintenance ticket cannot change its property',
            );
          const before = this.snapshot(ticket);
          if (dto.assignedToStaffId) {
            const staff = await manager.getRepository(Staff).findOne({
              where: {
                id: dto.assignedToStaffId,
                companyId: actor.companyId,
                deletedAt: IsNull(),
              },
              relations: ['user'],
            });
            if (
              !staff ||
              staff.user?.companyId !== actor.companyId ||
              !staff.user?.isActive ||
              staff.user?.deletedAt
            )
              throw new BadRequestException(
                'Assigned staff is not active in this company',
              );
          }

          this.applyScalarFields(ticket, dto);
          this.applyAssignmentUpdate(ticket, dto);
          this.applyStatusUpdate(ticket, dto);

          if (dto.resolvedAt !== undefined)
            ticket.resolvedAt = dto.resolvedAt
              ? new Date(dto.resolvedAt)
              : null;

          const saved = await repository.save(ticket);
          await this.audit(manager, actor, saved, 'update', before);
          await this.queueTransitionNotices(manager, saved, before);
          return this.findOne(id, actor, manager);
        },
      ),
    );
  }

  private async queueTransitionNotices(
    manager: EntityManager,
    ticket: MaintenanceTicket,
    before: Record<string, unknown>,
  ): Promise<void> {
    let event: CommunicationEvent;
    if (
      ticket.status === MaintenanceTicketStatus.RESOLVED &&
      before.status !== ticket.status
    )
      event = CommunicationEvent.MAINTENANCE_RESOLVED;
    else if (
      ticket.assignedToStaffId &&
      before.assignedToStaffId !== ticket.assignedToStaffId
    )
      event = CommunicationEvent.MAINTENANCE_ASSIGNED;
    else return;
    const recipients = await maintenanceNoticeRecipients(
      manager,
      ticket.companyId,
      ticket.id,
    );
    for (const recipient of recipients)
      await this.communicationsService.dispatchEvent(
        {
          companyId: ticket.companyId,
          event,
          recipientRole: recipient.role,
          recipientId: recipient.id,
          channel: CommunicationChannel.WHATSAPP,
          recipient: recipient.phone,
          locale: recipient.locale,
          variables: {
            nombre: recipient.name,
            titulo: ticket.title,
            estado:
              event === CommunicationEvent.MAINTENANCE_RESOLVED
                ? 'resuelto'
                : 'asignado',
          },
          fallbackSubject: 'Actualización de mantenimiento',
          fallbackBody:
            'Hola {{nombre}}, el ticket de mantenimiento "{{titulo}}" fue {{estado}}.',
          consented: true,
          relatedEntityType: 'maintenance_ticket',
          relatedEntityId: ticket.id,
          metadata: {
            maintenanceSnapshot: {
              status: ticket.status,
              assignedToStaffId: ticket.assignedToStaffId,
              title: ticket.title,
              updatedAt: ticket.updatedAt.toISOString(),
            },
          },
        },
        manager,
      );
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
    if (dto.scheduledAt !== undefined) {
      ticket.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      ticket.metadata = {
        ...ticket.metadata,
        agendaScheduleKind:
          typeof dto.scheduledAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(dto.scheduledAt)
            ? 'date'
            : 'time',
      };
    }
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
    if (!dto.assignedToStaffId) {
      ticket.assignedAt = null;
      if (ticket.status === MaintenanceTicketStatus.ASSIGNED)
        ticket.status = MaintenanceTicketStatus.OPEN;
    }
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

  async remove(
    id: string,
    actor: MaintenanceActor,
    executionKey?: string,
  ): Promise<void> {
    this.requireCompany(actor);
    if (!getUserRoles(actor).includes(UserRole.ADMIN))
      throw new ForbiddenException('Only admin can delete maintenance tickets');
    await this.ticketRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'maintenance.delete',
        { actorId: actor.id, id },
        async () => {
          const ticket = await this.lockTicket(manager, id, actor);
          await this.audit(
            manager,
            actor,
            ticket,
            'delete',
            this.snapshot(ticket),
          );
          await manager
            .getRepository(MaintenanceTicket)
            .softDelete({ id, companyId: actor.companyId });
          return null;
        },
      ),
    );
  }

  async addComment(
    ticketId: string,
    actor: MaintenanceActor,
    dto: CreateCommentDto,
    executionKey?: string,
  ): Promise<MaintenanceTicketComment> {
    await this.findOne(ticketId, actor);
    if (!dto.body?.trim() || dto.body.length > 10000)
      throw new BadRequestException(
        'Comment body must contain 1–10000 characters',
      );
    const safeDto = {
      body: dto.body.trim(),
      isInternal: isAdminOrStaff(actor) && (dto.isInternal ?? false),
    };
    return this.ticketRepository.manager.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        actor.companyId,
        executionKey,
        'maintenance.comment',
        { actorId: actor.id, ticketId, ...safeDto },
        async () => {
          await this.lockTicket(manager, ticketId, actor);
          const repository = manager.getRepository(MaintenanceTicketComment);
          const comment = repository.create({
            ticketId,
            userId: actor.id,
            ...safeDto,
          });
          const saved = await repository.save(comment);
          await manager.query(
            `INSERT INTO maintenance_ticket_audit(company_id,ticket_id,actor_id,action,after_snapshot) VALUES($1,$2,$3,'comment',$4::jsonb)`,
            [
              actor.companyId,
              ticketId,
              actor.id,
              JSON.stringify({
                commentId: saved.id,
                isInternal: saved.isInternal,
              }),
            ],
          );
          return saved;
        },
      ),
    );
  }

  async getComments(
    ticketId: string,
    actor: MaintenanceActor,
    includeInternal: boolean,
  ): Promise<MaintenanceTicketComment[]> {
    await this.findOne(ticketId, actor);

    const qb = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.ticket_id = :ticketId', { ticketId });

    if (!includeInternal || !isAdminOrStaff(actor)) {
      qb.andWhere('comment.is_internal = false');
    }

    return qb.orderBy('comment.created_at', 'ASC').getMany();
  }

  private requireCompany(actor: MaintenanceActor): void {
    if (!actor.companyId)
      throw new ForbiddenException('Company scope required');
  }

  private validateFields(
    dto: CreateMaintenanceTicketDto | UpdateMaintenanceTicketDto,
  ): void {
    if (
      dto.title !== undefined &&
      (!dto.title?.trim() || dto.title.length > 200)
    )
      throw new BadRequestException(
        'Ticket title must contain 1–200 characters',
      );
    if (
      dto.costCurrency !== undefined &&
      !['ARS', 'USD', 'BRL'].includes(dto.costCurrency)
    )
      throw new BadRequestException('Unsupported maintenance currency');
    for (const amount of [
      dto.estimatedCost,
      (dto as UpdateMaintenanceTicketDto).actualCost,
    ])
      if (
        amount != null &&
        (!Number.isFinite(amount) ||
          !/^\d{1,10}(\.\d{1,2})?$/.test(String(amount)))
      )
        throw new BadRequestException(
          'Maintenance costs require nonnegative exact cents',
        );
    for (const date of [
      dto.scheduledAt,
      (dto as UpdateMaintenanceTicketDto).resolvedAt,
    ])
      if (date != null && !Number.isFinite(new Date(date).getTime()))
        throw new BadRequestException('Invalid maintenance date');
  }

  private async lockTicket(
    manager: EntityManager,
    id: string,
    actor: MaintenanceActor,
  ): Promise<MaintenanceTicket> {
    const ticket = await manager.getRepository(MaintenanceTicket).findOne({
      where: { id, companyId: actor.companyId, deletedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!ticket) throw new NotFoundException('Maintenance ticket not found');
    await this.propertiesService.findOneScoped(ticket.propertyId, actor);
    return ticket;
  }

  private snapshot(ticket: MaintenanceTicket): Record<string, unknown> {
    return Object.fromEntries(
      [
        'title',
        'description',
        'area',
        'priority',
        'source',
        'status',
        'assignedToStaffId',
        'assignedAt',
        'scheduledAt',
        'resolvedAt',
        'resolutionNotes',
        'estimatedCost',
        'actualCost',
        'costCurrency',
        'externalRef',
        'deletedAt',
      ].map((key) => [key, ticket[key as keyof MaintenanceTicket] ?? null]),
    );
  }

  private audit(
    manager: EntityManager,
    actor: MaintenanceActor,
    ticket: MaintenanceTicket,
    action: string,
    before: Record<string, unknown> | null,
  ): Promise<unknown> {
    return manager.query(
      `INSERT INTO maintenance_ticket_audit(company_id,ticket_id,actor_id,action,before_snapshot,after_snapshot) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [
        actor.companyId,
        ticket.id,
        actor.id,
        action,
        before ? JSON.stringify(before) : null,
        JSON.stringify(this.snapshot(ticket)),
      ],
    );
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
              AND scope_owner.company_id = :companyId
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
