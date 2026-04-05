import { Test, TestingModule } from '@nestjs/testing';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { Staff, StaffSpecialization } from './entities/staff.entity';
import { UserRole } from '../users/entities/user.entity';

const mockStaffService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  activate: jest.fn(),
};

const mockRequest = {
  user: {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    companyId: 'company-uuid-1',
    role: UserRole.ADMIN,
  },
};

const mockStaff: Partial<Staff> = {
  id: 'staff-uuid-1',
  userId: 'user-uuid-1',
  companyId: 'company-uuid-1',
  specialization: StaffSpecialization.MAINTENANCE,
};

describe('StaffController', () => {
  let controller: StaffController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffController],
      providers: [{ provide: StaffService, useValue: mockStaffService }],
    }).compile();

    controller = module.get(StaffController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service with companyId and filters', async () => {
      mockStaffService.findAll.mockResolvedValue([mockStaff]);

      const result = await controller.findAll(mockRequest as any, {});

      expect(mockStaffService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        {},
      );
      expect(result).toEqual([mockStaff]);
    });
  });

  describe('findOne', () => {
    it('delegates to service with id and companyId', async () => {
      mockStaffService.findOne.mockResolvedValue(mockStaff);

      const result = await controller.findOne(
        'staff-uuid-1',
        mockRequest as any,
      );

      expect(mockStaffService.findOne).toHaveBeenCalledWith(
        'staff-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(mockStaff);
    });
  });

  describe('create', () => {
    it('delegates to service with dto and companyId', async () => {
      const dto = {
        firstName: 'Jane',
        lastName: 'Smith',
        specialization: StaffSpecialization.CLEANING,
      } as any;

      mockStaffService.create.mockResolvedValue(mockStaff);

      const result = await controller.create(dto, mockRequest as any);

      expect(mockStaffService.create).toHaveBeenCalledWith(
        dto,
        'company-uuid-1',
      );
      expect(result).toEqual(mockStaff);
    });
  });

  describe('update', () => {
    it('delegates to service', async () => {
      const dto = { notes: 'updated' } as any;
      mockStaffService.update.mockResolvedValue({
        ...mockStaff,
        notes: 'updated',
      });

      const result = await controller.update(
        'staff-uuid-1',
        dto,
        mockRequest as any,
      );

      expect(mockStaffService.update).toHaveBeenCalledWith(
        'staff-uuid-1',
        dto,
        'company-uuid-1',
      );
      expect(result).toMatchObject({ notes: 'updated' });
    });
  });

  describe('remove', () => {
    it('delegates to service', async () => {
      mockStaffService.remove.mockResolvedValue(undefined);

      await controller.remove('staff-uuid-1', mockRequest as any);

      expect(mockStaffService.remove).toHaveBeenCalledWith(
        'staff-uuid-1',
        'company-uuid-1',
      );
    });
  });

  describe('activate', () => {
    it('delegates to service', async () => {
      mockStaffService.activate.mockResolvedValue(mockStaff);

      const result = await controller.activate(
        'staff-uuid-1',
        mockRequest as any,
      );

      expect(mockStaffService.activate).toHaveBeenCalledWith(
        'staff-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(mockStaff);
    });
  });
});
