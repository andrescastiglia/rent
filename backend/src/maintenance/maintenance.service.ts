import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  MaintenanceTicket,
  MaintenanceTicketStatus,
} from './entities/maintenance-ticket.entity';
import { MaintenanceTicketComment } from './entities/maintenance-ticket-comment.entity';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { MaintenanceTicketFiltersDto } from './dto/maintenance-ticket-filters.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceTicket)
    private readonly ticketRepository: Repository<MaintenanceTicket>,
    @InjectRepository(MaintenanceTicketComment)
    private readonly commentRepository: Repository<MaintenanceTicketComment>,
  ) {}

  async findAll(
    companyId: string,
    filters: MaintenanceTicketFiltersDto,
  ): Promise<MaintenanceTicket[]> {
    const qb = this.ticketRepository
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.property', 'property')
      .leftJoinAndSelect('ticket.assignedStaff', 'assignedStaff')
      .leftJoinAndSelect('assignedStaff.user', 'staffUser')
      .leftJoinAndSelect('ticket.reportedBy', 'reportedBy')
      .where('ticket.company_id = :companyId', { companyId })
      .andWhere('ticket.deleted_at IS NULL');

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

  async findOne(id: string, companyId: string): Promise<MaintenanceTicket> {
    const ticket = await this.ticketRepository.findOne({
      where: { id, companyId, deletedAt: IsNull() },
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

    return ticket;
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateMaintenanceTicketDto,
  ): Promise<MaintenanceTicket> {
    const ticket = this.ticketRepository.create({
      companyId,
      reportedByUserId: userId,
      propertyId: dto.propertyId,
      title: dto.title,
      description: dto.description ?? null,
      area: dto.area,
      priority: dto.priority,
      source: dto.source,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      estimatedCost: dto.estimatedCost ?? null,
      costCurrency: dto.costCurrency ?? 'ARS',
      status: MaintenanceTicketStatus.OPEN,
    });

    const saved = await this.ticketRepository.save(ticket);
    return this.findOne(saved.id, companyId);
  }

  async update(
    id: string,
    companyId: string,
    dto: UpdateMaintenanceTicketDto,
  ): Promise<MaintenanceTicket> {
    const ticket = await this.findOne(id, companyId);

    this.applyScalarFields(ticket, dto);
    this.applyAssignmentUpdate(ticket, dto);
    this.applyStatusUpdate(ticket, dto);

    if (dto.resolvedAt !== undefined)
      ticket.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;

    await this.ticketRepository.save(ticket);
    return this.findOne(id, companyId);
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

  async remove(id: string, companyId: string): Promise<void> {
    const ticket = await this.findOne(id, companyId);
    await this.ticketRepository.softDelete(ticket.id);
  }

  async addComment(
    ticketId: string,
    companyId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<MaintenanceTicketComment> {
    await this.findOne(ticketId, companyId);

    const comment = this.commentRepository.create({
      ticketId,
      userId,
      body: dto.body,
      isInternal: dto.isInternal ?? false,
    });

    return this.commentRepository.save(comment);
  }

  async getComments(
    ticketId: string,
    companyId: string,
    isAdminOrStaff: boolean,
  ): Promise<MaintenanceTicketComment[]> {
    await this.findOne(ticketId, companyId);

    const qb = this.commentRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.ticket_id = :ticketId', { ticketId });

    if (!isAdminOrStaff) {
      qb.andWhere('comment.is_internal = false');
    }

    return qb.orderBy('comment.created_at', 'ASC').getMany();
  }
}
