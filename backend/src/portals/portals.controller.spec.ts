import { Test, TestingModule } from '@nestjs/testing';
import { PortalsController } from './portals.controller';
import { PortalsService } from './portals.service';
import {
  PortalListing,
  PortalListingStatus,
  PortalName,
} from './entities/portal-listing.entity';
import { UserRole } from '../users/entities/user.entity';

const mockPortalsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  publish: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  syncAll: jest.fn(),
};

const mockRequest = {
  user: {
    id: 'user-uuid-1',
    email: 'admin@example.com',
    companyId: 'company-uuid-1',
    role: UserRole.ADMIN,
  },
};

const mockListing: Partial<PortalListing> = {
  id: 'listing-uuid-1',
  companyId: 'company-uuid-1',
  propertyId: 'property-uuid-1',
  portal: PortalName.ZONAPROP,
  status: PortalListingStatus.DRAFT,
};

describe('PortalsController', () => {
  let controller: PortalsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PortalsController],
      providers: [{ provide: PortalsService, useValue: mockPortalsService }],
    }).compile();

    controller = module.get(PortalsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('delegates to service with companyId', async () => {
      mockPortalsService.findAll.mockResolvedValue([mockListing]);

      const result = await controller.findAll(mockRequest as any);

      expect(mockPortalsService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        undefined,
      );
      expect(result).toEqual([mockListing]);
    });

    it('passes propertyId filter to service', async () => {
      mockPortalsService.findAll.mockResolvedValue([]);

      await controller.findAll(mockRequest as any, 'property-uuid-1');

      expect(mockPortalsService.findAll).toHaveBeenCalledWith(
        'company-uuid-1',
        'property-uuid-1',
      );
    });
  });

  describe('findOne', () => {
    it('delegates to service with id and companyId', async () => {
      mockPortalsService.findOne.mockResolvedValue(mockListing);

      const result = await controller.findOne(
        'listing-uuid-1',
        mockRequest as any,
      );

      expect(mockPortalsService.findOne).toHaveBeenCalledWith(
        'listing-uuid-1',
        'company-uuid-1',
      );
      expect(result).toEqual(mockListing);
    });
  });

  describe('create', () => {
    it('delegates to service with companyId and dto', async () => {
      const dto = {
        propertyId: 'property-uuid-1',
        portal: PortalName.ZONAPROP,
      };
      mockPortalsService.create.mockResolvedValue(mockListing);

      const result = await controller.create(dto as any, mockRequest as any);

      expect(mockPortalsService.create).toHaveBeenCalledWith(
        'company-uuid-1',
        dto,
      );
      expect(result).toEqual(mockListing);
    });
  });

  describe('publish', () => {
    it('delegates to service', async () => {
      const published = {
        ...mockListing,
        status: PortalListingStatus.PUBLISHED,
      };
      mockPortalsService.publish.mockResolvedValue(published);

      const result = await controller.publish(
        'listing-uuid-1',
        mockRequest as any,
      );

      expect(mockPortalsService.publish).toHaveBeenCalledWith(
        'listing-uuid-1',
        'company-uuid-1',
      );
      expect(result.status).toBe(PortalListingStatus.PUBLISHED);
    });
  });

  describe('pause', () => {
    it('delegates to service', async () => {
      const paused = { ...mockListing, status: PortalListingStatus.PAUSED };
      mockPortalsService.pause.mockResolvedValue(paused);

      const result = await controller.pause(
        'listing-uuid-1',
        mockRequest as any,
      );

      expect(mockPortalsService.pause).toHaveBeenCalledWith(
        'listing-uuid-1',
        'company-uuid-1',
      );
      expect(result.status).toBe(PortalListingStatus.PAUSED);
    });
  });

  describe('remove', () => {
    it('delegates to service', async () => {
      mockPortalsService.remove.mockResolvedValue(undefined);

      await controller.remove('listing-uuid-1', mockRequest as any);

      expect(mockPortalsService.remove).toHaveBeenCalledWith(
        'listing-uuid-1',
        'company-uuid-1',
      );
    });
  });

  describe('syncAll', () => {
    it('delegates to service with companyId', async () => {
      mockPortalsService.syncAll.mockResolvedValue([mockListing]);

      const result = await controller.syncAll(mockRequest as any);

      expect(mockPortalsService.syncAll).toHaveBeenCalledWith('company-uuid-1');
      expect(result).toEqual([mockListing]);
    });
  });
});
