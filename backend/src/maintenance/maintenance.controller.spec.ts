import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import {
  MaintenanceTicket,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from './entities/maintenance-ticket.entity';
import { UserRole } from '../users/entities/user.entity';

const mockMaintenanceService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addComment: jest.fn(),
  getComments: jest.fn(),
};

const mockRequest = {
  user: {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    companyId: 'company-uuid-1',
    role: UserRole.ADMIN,
  },
};

const mockTicket: Partial<MaintenanceTicket> = {
  id: 'ticket-uuid-1',
  companyId: 'company-uuid-1',
  propertyId: 'property-uuid-1',
  title: 'Leaking pipe',
  status: MaintenanceTicketStatus.OPEN,
  priority: MaintenanceTicketPriority.HIGH,
  area: MaintenanceTicketArea.PLUMBING,
  source: MaintenanceTicketSource.TENANT,
};

describe('MaintenanceController', () => {
  let controller: MaintenanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceController],
      providers: [
        { provide: MaintenanceService, useValue: mockMaintenanceService },
      ],
    }).compile();

    controller = module.get(MaintenanceController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service with companyId and filters', async () => {
      mockMaintenanceService.findAll.mockResolvedValue([mockTicket]);

      const result = await controller.findAll(mockRequest as any, {});

      expect(mockMaintenanceService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        {},
      );
      expect(result).toEqual([mockTicket]);
    });
  });

  describe('findOne', () => {
    it('delegates to service with id and companyId', async () => {
      mockMaintenanceService.findOne.mockResolvedValue(mockTicket);

      const result = await controller.findOne(
        'ticket-uuid-1',
        mockRequest as any,
      );

      expect(mockMaintenanceService.findOne).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(mockTicket);
    });
  });

  describe('create', () => {
    it('delegates to service with companyId and userId', async () => {
      const dto = {
        title: 'Leaking pipe',
        propertyId: 'property-uuid-1',
      } as any;

      mockMaintenanceService.create.mockResolvedValue(mockTicket);

      const result = await controller.create(dto, mockRequest as any);

      expect(mockMaintenanceService.create).toHaveBeenCalledWith(
        'company-uuid-1',
        'user-uuid-1',
        dto,
      );
      expect(result).toEqual(mockTicket);
    });
  });

  describe('update', () => {
    it('delegates to service', async () => {
      const dto = { status: MaintenanceTicketStatus.IN_PROGRESS } as any;
      mockMaintenanceService.update.mockResolvedValue({
        ...mockTicket,
        status: MaintenanceTicketStatus.IN_PROGRESS,
      });

      const result = await controller.update(
        'ticket-uuid-1',
        dto,
        mockRequest as any,
      );

      expect(mockMaintenanceService.update).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
        dto,
      );
      expect(result).toMatchObject({
        status: MaintenanceTicketStatus.IN_PROGRESS,
      });
    });
  });

  describe('remove', () => {
    it('delegates to service', async () => {
      mockMaintenanceService.remove.mockResolvedValue(undefined);

      await controller.remove('ticket-uuid-1', mockRequest as any);

      expect(mockMaintenanceService.remove).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
      );
    });
  });

  describe('getComments', () => {
    it('delegates to service with isAdminOrStaff=true for ADMIN', async () => {
      mockMaintenanceService.getComments.mockResolvedValue([]);

      await controller.getComments('ticket-uuid-1', mockRequest as any);

      expect(mockMaintenanceService.getComments).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
        true,
      );
    });

    it('passes isAdminOrStaff=false for TENANT', async () => {
      const tenantRequest = {
        user: { ...mockRequest.user, role: UserRole.TENANT },
      };
      mockMaintenanceService.getComments.mockResolvedValue([]);

      await controller.getComments('ticket-uuid-1', tenantRequest as any);

      expect(mockMaintenanceService.getComments).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
        false,
      );
    });
  });

  describe('addComment', () => {
    it('delegates to service with ticketId, companyId and userId', async () => {
      const dto = { body: 'Looking into it' } as any;
      const comment = { id: 'comment-uuid-1', body: 'Looking into it' };
      mockMaintenanceService.addComment.mockResolvedValue(comment);

      const result = await controller.addComment(
        'ticket-uuid-1',
        dto,
        mockRequest as any,
      );

      expect(mockMaintenanceService.addComment).toHaveBeenCalledWith(
        'ticket-uuid-1',
        'company-uuid-1',
        'user-uuid-1',
        dto,
      );
      expect(result).toEqual(comment);
    });
  });
});
