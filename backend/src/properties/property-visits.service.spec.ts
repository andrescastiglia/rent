import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyVisitsService } from './property-visits.service';
import { Property } from './entities/property.entity';
import {
  PropertyVisit,
  PropertyVisitKind,
} from './entities/property-visit.entity';
import {
  PropertyVisitNotification,
  VisitNotificationStatus,
} from './entities/property-visit-notification.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  OwnerActivity,
  OwnerActivityStatus,
  OwnerActivityType,
} from '../owners/entities/owner-activity.entity';

describe('PropertyVisitsService', () => {
  let service: PropertyVisitsService;
  let propertiesRepository: MockRepository<Property>;
  let visitsRepository: MockRepository<PropertyVisit>;
  let notificationsRepository: MockRepository<PropertyVisitNotification>;
  let ownerActivitiesRepository: MockRepository<OwnerActivity>;
  let whatsappService: { sendTextMessage: jest.Mock };

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  });

  beforeEach(async () => {
    whatsappService = {
      sendTextMessage: jest
        .fn()
        .mockResolvedValue({ messageId: 'wamid.test', raw: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertyVisitsService,
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(PropertyVisit),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(PropertyVisitNotification),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(OwnerActivity),
          useValue: createMockRepository(),
        },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    service = module.get(PropertyVisitsService);
    propertiesRepository = module.get(getRepositoryToken(Property));
    visitsRepository = module.get(getRepositoryToken(PropertyVisit));
    notificationsRepository = module.get(
      getRepositoryToken(PropertyVisitNotification),
    );
    ownerActivitiesRepository = module.get(getRepositoryToken(OwnerActivity));
  });

  it('should register a visit and send notifications', async () => {
    const property = {
      id: 'prop-1',
      name: 'Casa Linda',
      companyId: 'company-1',
      ownerId: 'owner-1',
      ownerWhatsapp: '+54 9 11 1234-5678',
      owner: { userId: 'owner-1' },
    } as Property;

    propertiesRepository.findOne!.mockResolvedValue(property);

    visitsRepository.create!.mockImplementation((data) => ({
      id: 'visit-1',
      ...data,
    }));
    visitsRepository.save!.mockImplementation(async (data) => data);

    notificationsRepository.create!.mockImplementation((data) => ({
      id: 'notif-1',
      ...data,
    }));
    notificationsRepository.save!.mockImplementation(async (data) => data);
    ownerActivitiesRepository.create!.mockImplementation((data) => ({
      id: 'activity-1',
      ...data,
    }));
    ownerActivitiesRepository.save!.mockImplementation(async (data) => data);

    const result = await service.create(
      'prop-1',
      {
        visitedAt: '2025-01-05T10:00:00Z',
        interestedName: 'Ana',
        comments: 'Le gustó',
        hasOffer: true,
        offerAmount: 1000,
        offerCurrency: 'ARS',
      },
      { id: 'agent-1', role: 'agent', companyId: 'company-1' },
    );

    expect(result.notifications).toBeDefined();
    expect(result.notifications).toHaveLength(1);
    expect(notificationsRepository.save).toHaveBeenCalledTimes(2);
    expect(ownerActivitiesRepository.save).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendTextMessage).toHaveBeenCalledTimes(1);

    const savedNotifications = notificationsRepository.save!.mock.calls[1][0];
    for (const notification of savedNotifications) {
      expect(notification.status).toBe(VisitNotificationStatus.SENT);
      expect(notification.sentAt).toBeInstanceOf(Date);
    }

    expect(ownerActivitiesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        type: OwnerActivityType.VISIT,
        status: OwnerActivityStatus.COMPLETED,
        metadata: expect.objectContaining({
          visitId: 'visit-1',
          kind: PropertyVisitKind.VISIT,
          interestedName: 'Ana',
        }),
      }),
    );
  });

  it('should store visit details including offered amount', async () => {
    const property = {
      id: 'prop-1',
      name: 'Casa Linda',
      companyId: 'company-1',
      ownerId: 'owner-1',
      owner: { userId: 'owner-1' },
    } as Property;

    propertiesRepository.findOne!.mockResolvedValue(property);
    visitsRepository.create!.mockImplementation((data) => ({
      id: 'visit-1',
      ...data,
    }));
    visitsRepository.save!.mockImplementation(async (data) => data);
    notificationsRepository.save!.mockImplementation(async (data) => data);
    ownerActivitiesRepository.create!.mockImplementation((data) => ({
      id: 'activity-2',
      ...data,
    }));
    ownerActivitiesRepository.save!.mockImplementation(async (data) => data);

    const result = await service.create(
      'prop-1',
      {
        visitedAt: '2025-01-10T09:30:00Z',
        interestedName: 'Luis',
        comments: 'Consultó precio',
        hasOffer: true,
        offerAmount: 2500,
      },
      { id: 'agent-1', role: 'agent', companyId: 'company-1' },
    );

    expect(result.visitedAt.toISOString()).toBe('2025-01-10T09:30:00.000Z');
    expect(result.hasOffer).toBe(true);
    expect(result.offerAmount).toBe(2500);
  });

  it('should create a maintenance task and owner activity without notifications', async () => {
    const property = {
      id: 'prop-1',
      name: 'Casa Linda',
      companyId: 'company-1',
      ownerId: 'owner-1',
      ownerWhatsapp: '+54 9 11 1234-5678',
      owner: { userId: 'owner-1' },
    } as Property;

    propertiesRepository.findOne!.mockResolvedValue(property);
    visitsRepository.create!.mockImplementation((data) => ({
      id: 'task-1',
      ...data,
    }));
    visitsRepository.save!.mockImplementation(async (data) => data);
    ownerActivitiesRepository.create!.mockImplementation((data) => ({
      id: 'activity-3',
      ...data,
    }));
    ownerActivitiesRepository.save!.mockImplementation(async (data) => data);

    const result = await service.createMaintenanceTask(
      'prop-1',
      {
        title: 'Revisar humedad',
        notes: 'Coordinar con plomero',
        scheduledAt: '2025-02-10T12:00:00Z',
      },
      { id: 'agent-1', role: 'agent', companyId: 'company-1' },
    );

    expect(result.kind).toBe(PropertyVisitKind.MAINTENANCE);
    expect(result.interestedName).toBe('Revisar humedad');
    expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
    expect(notificationsRepository.save).not.toHaveBeenCalled();
    expect(ownerActivitiesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: OwnerActivityType.TASK,
        status: OwnerActivityStatus.PENDING,
        metadata: expect.objectContaining({
          taskId: 'task-1',
          kind: PropertyVisitKind.MAINTENANCE,
          title: 'Revisar humedad',
        }),
      }),
    );
  });

  describe('findAll', () => {
    it('should return visits for a property', async () => {
      const property = {
        id: 'prop-1',
        companyId: 'company-1',
        owner: { userId: 'owner-1' },
      } as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.find!.mockResolvedValue([{ id: 'v1' }, { id: 'v2' }]);

      const result = await service.findAll('prop-1', {
        id: 'agent-1',
        role: 'agent',
        companyId: 'company-1',
      });

      expect(result).toHaveLength(2);
      expect(visitsRepository.find).toHaveBeenCalledWith({
        where: { propertyId: 'prop-1', kind: PropertyVisitKind.VISIT },
        relations: ['interestedProfile'],
        order: { visitedAt: 'DESC' },
      });
    });
  });

  describe('findMaintenanceTasks', () => {
    it('should return maintenance tasks for a property', async () => {
      const property = {
        id: 'prop-1',
        companyId: 'company-1',
        owner: { userId: 'owner-1' },
      } as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.find!.mockResolvedValue([{ id: 't1' }]);

      const result = await service.findMaintenanceTasks('prop-1', {
        id: 'agent-1',
        role: 'agent',
        companyId: 'company-1',
      });

      expect(result).toHaveLength(1);
      expect(visitsRepository.find).toHaveBeenCalledWith({
        where: { propertyId: 'prop-1', kind: PropertyVisitKind.MAINTENANCE },
        order: { visitedAt: 'DESC' },
      });
    });
  });

  describe('validation errors', () => {
    const property = {
      id: 'prop-1',
      companyId: 'company-1',
      ownerId: null,
      owner: { userId: 'owner-1' },
    } as unknown as Property;

    beforeEach(() => {
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({ id: 'v', ...d }));
      visitsRepository.save!.mockImplementation(async (d) => d);
    });

    it('should throw on invalid visit date', async () => {
      await expect(
        service.create(
          'prop-1',
          { visitedAt: 'not-a-date', interestedName: 'Ana' },
          { id: 'u1', role: 'agent', companyId: 'company-1' },
        ),
      ).rejects.toThrow('Invalid visit date');
    });

    it('should throw when hasOffer is true but offerAmount is missing', async () => {
      await expect(
        service.create(
          'prop-1',
          { interestedName: 'Ana', hasOffer: true },
          { id: 'u1', role: 'agent', companyId: 'company-1' },
        ),
      ).rejects.toThrow('Offer amount is required when hasOffer');
    });

    it('should throw when visit has no interestedName or interestedProfileId', async () => {
      await expect(
        service.create(
          'prop-1',
          { visitedAt: '2025-01-05T10:00:00Z' },
          { id: 'u1', role: 'agent', companyId: 'company-1' },
        ),
      ).rejects.toThrow('Interested name or interested profile is required');
    });

    it('should throw when maintenance task has no title', async () => {
      await expect(
        service.createMaintenanceTask(
          'prop-1',
          { title: '   ', scheduledAt: '2025-01-05T10:00:00Z' } as any,
          { id: 'u1', role: 'agent', companyId: 'company-1' },
        ),
      ).rejects.toThrow('Maintenance task title is required');
    });
  });

  describe('getPropertyForAccess', () => {
    it('should throw NotFoundException when property not found', async () => {
      propertiesRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.findAll('prop-999', {
          id: 'u1',
          role: 'agent',
          companyId: 'company-1',
        }),
      ).rejects.toThrow('Property with ID prop-999 not found');
    });

    it('should throw ForbiddenException for wrong company', async () => {
      propertiesRepository.findOne!.mockResolvedValue({
        id: 'prop-1',
        companyId: 'other-company',
        owner: { userId: 'owner-1' },
      });

      await expect(
        service.findAll('prop-1', {
          id: 'u1',
          role: 'agent',
          companyId: 'company-1',
        }),
      ).rejects.toThrow('You can only access your own company');
    });

    it('should throw ForbiddenException for owner accessing other property', async () => {
      propertiesRepository.findOne!.mockResolvedValue({
        id: 'prop-1',
        companyId: 'company-1',
        owner: { userId: 'different-owner' },
      });

      await expect(
        service.findAll('prop-1', {
          id: 'u1',
          role: 'owner',
          companyId: 'company-1',
        }),
      ).rejects.toThrow('You can only access your own properties');
    });
  });

  describe('notification edge cases', () => {
    const property = {
      id: 'prop-1',
      name: 'Depto Centro',
      companyId: 'company-1',
      ownerId: 'owner-1',
      ownerWhatsapp: null,
      owner: { userId: 'owner-1' },
    } as unknown as Property;

    beforeEach(() => {
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({
        id: 'v1',
        ...d,
      }));
      visitsRepository.save!.mockImplementation(async (d) => d);
      ownerActivitiesRepository.create!.mockImplementation((d) => ({
        id: 'a1',
        ...d,
      }));
      ownerActivitiesRepository.save!.mockImplementation(async (d) => d);
    });

    it('should skip notifications when no ownerWhatsapp', async () => {
      const result = await service.create(
        'prop-1',
        { interestedName: 'Ana', visitedAt: '2025-01-05T10:00:00Z' },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );

      expect(whatsappService.sendTextMessage).not.toHaveBeenCalled();
      expect(notificationsRepository.save).not.toHaveBeenCalled();
      expect(result.notifications).toBeUndefined();
    });

    it('should handle notification dispatch failure gracefully', async () => {
      const propWithWa = {
        ...property,
        ownerWhatsapp: '+5491112345678',
      };
      propertiesRepository.findOne!.mockResolvedValue(propWithWa);
      notificationsRepository.create!.mockImplementation((d) => ({
        id: 'n1',
        ...d,
      }));
      notificationsRepository.save!.mockImplementation(async (d) => d);
      whatsappService.sendTextMessage.mockRejectedValue(
        new Error('WhatsApp API error'),
      );

      await service.create(
        'prop-1',
        { interestedName: 'Ana', visitedAt: '2025-01-05T10:00:00Z' },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );

      const savedNotifications = notificationsRepository.save!.mock.calls[1][0];
      expect(savedNotifications[0].status).toBe(VisitNotificationStatus.FAILED);
      expect(savedNotifications[0].error).toBe('WhatsApp API error');
    });
  });

  describe('owner activity edge cases', () => {
    it('should skip owner activity when property has no ownerId', async () => {
      const property = {
        id: 'prop-1',
        name: 'Terreno',
        companyId: 'company-1',
        ownerId: null,
        owner: null,
      } as unknown as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({
        id: 'v1',
        ...d,
      }));
      visitsRepository.save!.mockImplementation(async (d) => d);

      await service.create(
        'prop-1',
        { interestedName: 'Pablo', visitedAt: '2025-01-05T10:00:00Z' },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );

      expect(ownerActivitiesRepository.save).not.toHaveBeenCalled();
    });

    it('should skip maintenance owner activity when no ownerId', async () => {
      const property = {
        id: 'prop-1',
        name: 'Terreno',
        companyId: 'company-1',
        ownerId: null,
        owner: null,
      } as unknown as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({
        id: 't1',
        ...d,
      }));
      visitsRepository.save!.mockImplementation(async (d) => d);

      await service.createMaintenanceTask(
        'prop-1',
        { title: 'Pintar', scheduledAt: '2025-02-01T10:00:00Z' },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );

      expect(ownerActivitiesRepository.save).not.toHaveBeenCalled();
    });

    it('should use interestedProfileId when interestedName is absent', async () => {
      const property = {
        id: 'prop-1',
        name: 'Casa',
        companyId: 'company-1',
        ownerId: 'owner-1',
        ownerWhatsapp: null,
        owner: { userId: 'owner-1' },
      } as unknown as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({
        id: 'v1',
        ...d,
      }));
      visitsRepository.save!.mockImplementation(async (d) => d);
      ownerActivitiesRepository.create!.mockImplementation((d) => ({
        id: 'a1',
        ...d,
      }));
      ownerActivitiesRepository.save!.mockImplementation(async (d) => d);

      await service.create(
        'prop-1',
        {
          interestedProfileId: 'profile-abc',
          visitedAt: '2025-01-05T10:00:00Z',
        },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );

      expect(ownerActivitiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('profile-abc'),
        }),
      );
    });

    it('should default to current date when visitedAt is omitted', async () => {
      const property = {
        id: 'prop-1',
        name: 'Casa',
        companyId: 'company-1',
        ownerId: null,
        owner: null,
      } as unknown as Property;
      propertiesRepository.findOne!.mockResolvedValue(property);
      visitsRepository.create!.mockImplementation((d) => ({
        id: 'v1',
        ...d,
      }));
      visitsRepository.save!.mockImplementation(async (d) => d);

      const before = new Date();
      await service.create(
        'prop-1',
        { interestedName: 'Test' },
        { id: 'u1', role: 'agent', companyId: 'company-1' },
      );
      const after = new Date();

      const createdData = visitsRepository.create!.mock.calls[0][0];
      expect(createdData.visitedAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(createdData.visitedAt.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
    });
  });
});
