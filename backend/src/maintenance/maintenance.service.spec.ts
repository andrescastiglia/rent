import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import {
  MaintenanceTicket,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from './entities/maintenance-ticket.entity';
import { MaintenanceTicketComment } from './entities/maintenance-ticket-comment.entity';
import { PropertiesService } from '../properties/properties.service';
import { UserRole } from '../users/entities/user.entity';

type MockRepository<T extends Record<string, any> = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockQb = () => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([]),
});

const createMockRepository = () => {
  const qb = createMockQb();
  const repo: MockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  return repo;
};

const adminActor = {
  id: 'user-uuid-1',
  companyId: 'company-uuid-1',
  role: UserRole.ADMIN,
};

const ownerActor = {
  ...adminActor,
  id: 'owner-user-uuid-1',
  role: UserRole.OWNER,
};

const tenantActor = {
  ...adminActor,
  id: 'tenant-user-uuid-1',
  role: UserRole.TENANT,
};

const mockTicket = (
  overrides: Partial<MaintenanceTicket> = {},
): MaintenanceTicket =>
  ({
    id: 'ticket-uuid-1',
    companyId: 'company-uuid-1',
    propertyId: 'property-uuid-1',
    reportedByUserId: 'user-uuid-1',
    source: MaintenanceTicketSource.ADMIN,
    assignedToStaffId: null,
    assignedAt: null,
    title: 'Leaking pipe',
    description: null,
    area: MaintenanceTicketArea.PLUMBING,
    priority: MaintenanceTicketPriority.HIGH,
    status: MaintenanceTicketStatus.OPEN,
    scheduledAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    estimatedCost: null,
    actualCost: null,
    costCurrency: 'ARS',
    externalRef: null,
    metadata: null,
    comments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    property: {} as any,
    assignedStaff: null,
    reportedBy: {} as any,
    ...overrides,
  }) as MaintenanceTicket;

const mockComment = (
  overrides: Partial<MaintenanceTicketComment> = {},
): MaintenanceTicketComment =>
  ({
    id: 'comment-uuid-1',
    ticketId: 'ticket-uuid-1',
    userId: 'user-uuid-1',
    body: 'Working on it',
    isInternal: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ticket: {} as any,
    user: {} as any,
    ...overrides,
  }) as MaintenanceTicketComment;

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let ticketRepository: MockRepository<MaintenanceTicket>;
  let commentRepository: MockRepository<MaintenanceTicketComment>;
  let propertiesService: { findOneScoped: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: getRepositoryToken(MaintenanceTicket),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(MaintenanceTicketComment),
          useValue: createMockRepository(),
        },
        {
          provide: PropertiesService,
          useValue: { findOneScoped: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get(MaintenanceService);
    ticketRepository = module.get(getRepositoryToken(MaintenanceTicket));
    commentRepository = module.get(
      getRepositoryToken(MaintenanceTicketComment),
    );
    propertiesService = module.get(PropertiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns list of tickets', async () => {
      const tickets = [mockTicket()];
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(tickets);

      const result = await service.findAll(adminActor, {});

      expect(result).toEqual(tickets);
    });

    it('applies status filter', async () => {
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll(adminActor, {
        status: MaintenanceTicketStatus.OPEN,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('ticket.status = :status', {
        status: MaintenanceTicketStatus.OPEN,
      });
    });

    it('applies priority filter', async () => {
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll(adminActor, {
        priority: MaintenanceTicketPriority.HIGH,
      });

      expect(qb.andWhere).toHaveBeenCalledWith('ticket.priority = :priority', {
        priority: MaintenanceTicketPriority.HIGH,
      });
    });

    it('applies propertyId filter', async () => {
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll(adminActor, {
        propertyId: 'property-uuid-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'ticket.property_id = :propertyId',
        { propertyId: 'property-uuid-1' },
      );
    });

    it('applies assignedToStaffId filter', async () => {
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll(adminActor, {
        assignedToStaffId: 'staff-uuid-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'ticket.assigned_to_staff_id = :assignedToStaffId',
        { assignedToStaffId: 'staff-uuid-1' },
      );
    });

    it('applies search filter', async () => {
      const qb = ticketRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue([]);

      await service.findAll(adminActor, { search: 'Leak' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'LOWER(ticket.title) LIKE :search',
        { search: '%leak%' },
      );
    });

    it('scopes an owner to tickets for their properties', async () => {
      const qb = ticketRepository.createQueryBuilder!();

      await service.findAll(ownerActor, {});

      expect(qb.innerJoin).toHaveBeenCalledWith('property.owner', 'scopeOwner');
      expect(qb.andWhere).toHaveBeenCalledWith(
        'scopeOwner.user_id = :actorId',
        { actorId: ownerActor.id },
      );
    });

    it('scopes a tenant to tickets for their active rental', async () => {
      const qb = ticketRepository.createQueryBuilder!();

      await service.findAll(tenantActor, {});

      expect(qb.innerJoin).toHaveBeenCalledWith(
        'scopeLease.tenant',
        'scopeTenant',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'scopeTenant.user_id = :actorId AND scopeTenant.company_id = :companyId AND scopeTenant.deleted_at IS NULL',
        {
          actorId: tenantActor.id,
          companyId: tenantActor.companyId,
        },
      );
    });
  });

  describe('findOne', () => {
    it('returns ticket when found', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValue(ticket);

      const result = await service.findOne('ticket-uuid-1', adminActor);

      expect(result).toEqual(ticket);
      expect(propertiesService.findOneScoped).toHaveBeenCalledWith(
        ticket.propertyId,
        adminActor,
      );
    });

    it('throws NotFoundException when not found', async () => {
      ticketRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('missing-id', adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides a same-company ticket when its property is unrelated', async () => {
      ticketRepository.findOne!.mockResolvedValue(mockTicket());
      propertiesService.findOneScoped.mockRejectedValue(
        new NotFoundException('Property not found'),
      );

      await expect(
        service.findOne('ticket-uuid-1', ownerActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates a ticket with open status', async () => {
      const dto = {
        title: 'Leaking pipe',
        propertyId: 'property-uuid-1',
        area: MaintenanceTicketArea.PLUMBING,
        priority: MaintenanceTicketPriority.HIGH,
        source: MaintenanceTicketSource.TENANT,
      };

      const ticket = mockTicket({ status: MaintenanceTicketStatus.OPEN });
      ticketRepository.create!.mockReturnValue(ticket);
      ticketRepository.save!.mockResolvedValue(ticket);
      ticketRepository.findOne!.mockResolvedValue(ticket);

      const result = await service.create(adminActor, dto);

      expect(ticketRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceTicketStatus.OPEN);
      expect(propertiesService.findOneScoped).toHaveBeenCalledWith(
        dto.propertyId,
        adminActor,
      );
    });

    it('rejects creation for a property unrelated to the actor', async () => {
      propertiesService.findOneScoped.mockRejectedValue(
        new NotFoundException('Property not found'),
      );

      await expect(
        service.create(ownerActor, {
          title: 'Unauthorized ticket',
          propertyId: 'other-property-uuid',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(ticketRepository.save).not.toHaveBeenCalled();
    });

    it('derives the audit source from the actor role', async () => {
      const ticket = mockTicket({ source: MaintenanceTicketSource.TENANT });
      ticketRepository.create!.mockReturnValue(ticket);
      ticketRepository.save!.mockResolvedValue(ticket);
      ticketRepository.findOne!.mockResolvedValue(ticket);

      await service.create(tenantActor, {
        title: 'Leaking pipe',
        propertyId: 'property-uuid-1',
        source: MaintenanceTicketSource.ADMIN,
      });

      expect(ticketRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: MaintenanceTicketSource.TENANT }),
      );
    });
  });

  describe('update', () => {
    it('updates scalar fields via applyScalarFields', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);
      const updated = mockTicket({
        description: 'Fixed',
        scheduledAt: new Date('2025-01-01'),
        estimatedCost: 500,
        costCurrency: 'USD',
        externalRef: 'REF-123',
        resolutionNotes: 'All done',
        actualCost: 450,
      });
      ticketRepository.save!.mockResolvedValue(updated);
      ticketRepository.findOne!.mockResolvedValueOnce(updated);

      const result = await service.update('ticket-uuid-1', adminActor, {
        description: 'Fixed',
        scheduledAt: new Date('2025-01-01'),
        estimatedCost: 500,
        costCurrency: 'USD',
        externalRef: 'REF-123',
        resolutionNotes: 'All done',
        actualCost: 450,
      });

      expect(ticketRepository.save).toHaveBeenCalled();
      expect(result.actualCost).toBe(450);
    });

    it('sets resolvedAt from dto when provided', async () => {
      const ticket = mockTicket({
        status: MaintenanceTicketStatus.IN_PROGRESS,
      });
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);
      const resolved = mockTicket({ resolvedAt: new Date('2025-06-01') });
      ticketRepository.save!.mockResolvedValue(resolved);
      ticketRepository.findOne!.mockResolvedValueOnce(resolved);

      await service.update('ticket-uuid-1', adminActor, {
        resolvedAt: new Date('2025-06-01'),
      });

      expect(ticketRepository.save).toHaveBeenCalled();
    });

    it('sets resolvedAt to null when dto.resolvedAt is falsy', async () => {
      const ticket = mockTicket({ resolvedAt: new Date() });
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);
      ticketRepository.save!.mockResolvedValue(ticket);
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);

      await service.update('ticket-uuid-1', adminActor, {
        resolvedAt: undefined,
      });

      expect(ticketRepository.save).toHaveBeenCalled();
    });

    it('transitions status to assigned when assignedToStaffId is set', async () => {
      const ticket = mockTicket({ status: MaintenanceTicketStatus.OPEN });
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);

      const updated = mockTicket({
        status: MaintenanceTicketStatus.ASSIGNED,
        assignedToStaffId: 'staff-uuid-1',
        assignedAt: new Date(),
      });
      ticketRepository.save!.mockResolvedValue(updated);
      ticketRepository.findOne!.mockResolvedValueOnce(updated);

      const result = await service.update('ticket-uuid-1', adminActor, {
        assignedToStaffId: 'staff-uuid-1',
      });

      expect(ticketRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceTicketStatus.ASSIGNED);
    });

    it('sets resolvedAt when status transitions to resolved', async () => {
      const ticket = mockTicket({
        status: MaintenanceTicketStatus.IN_PROGRESS,
        resolvedAt: null,
      });
      ticketRepository.findOne!.mockResolvedValueOnce(ticket);

      const resolved = mockTicket({
        status: MaintenanceTicketStatus.RESOLVED,
        resolvedAt: new Date(),
      });
      ticketRepository.save!.mockResolvedValue(resolved);
      ticketRepository.findOne!.mockResolvedValueOnce(resolved);

      const result = await service.update('ticket-uuid-1', adminActor, {
        status: MaintenanceTicketStatus.RESOLVED,
      });

      expect(ticketRepository.save).toHaveBeenCalled();
      expect(result.status).toBe(MaintenanceTicketStatus.RESOLVED);
    });
  });

  describe('remove', () => {
    it('soft deletes the ticket', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValue(ticket);
      ticketRepository.softDelete!.mockResolvedValue({ affected: 1 });

      await service.remove('ticket-uuid-1', adminActor);

      expect(ticketRepository.softDelete).toHaveBeenCalledWith('ticket-uuid-1');
    });

    it('throws NotFoundException when ticket not found', async () => {
      ticketRepository.findOne!.mockResolvedValue(null);

      await expect(service.remove('missing-id', adminActor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addComment', () => {
    it('creates a comment for a ticket', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValue(ticket);

      const comment = mockComment();
      commentRepository.create!.mockReturnValue(comment);
      commentRepository.save!.mockResolvedValue(comment);

      const result = await service.addComment('ticket-uuid-1', adminActor, {
        body: 'Working on it',
        isInternal: false,
      });

      expect(commentRepository.save).toHaveBeenCalled();
      expect(result.body).toBe('Working on it');
    });
  });

  describe('getComments', () => {
    it('returns all comments for admin/staff', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValue(ticket);

      const comments = [
        mockComment({ isInternal: false }),
        mockComment({ id: 'comment-uuid-2', isInternal: true }),
      ];
      const qb = commentRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(comments);

      const result = await service.getComments(
        'ticket-uuid-1',
        adminActor,
        true,
      );

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'comment.is_internal = false',
      );
      expect(result).toEqual(comments);
    });

    it('filters out internal comments for non-admin/staff', async () => {
      const ticket = mockTicket();
      ticketRepository.findOne!.mockResolvedValue(ticket);

      const publicComments = [mockComment({ isInternal: false })];
      const qb = commentRepository.createQueryBuilder!();
      qb.getMany.mockResolvedValue(publicComments);

      const result = await service.getComments(
        'ticket-uuid-1',
        tenantActor,
        false,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('comment.is_internal = false');
      expect(result).toEqual(publicComments);
    });
  });
});
