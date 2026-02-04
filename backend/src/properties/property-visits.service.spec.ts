import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyVisitsService } from './property-visits.service';
import { Property } from './entities/property.entity';
import { PropertyVisit } from './entities/property-visit.entity';
import {
  PropertyVisitNotification,
  VisitNotificationStatus,
} from './entities/property-visit-notification.entity';

describe('PropertyVisitsService', () => {
  let service: PropertyVisitsService;
  let propertiesRepository: MockRepository<Property>;
  let visitsRepository: MockRepository<PropertyVisit>;
  let notificationsRepository: MockRepository<PropertyVisitNotification>;

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
      ],
    }).compile();

    service = module.get(PropertyVisitsService);
    propertiesRepository = module.get(getRepositoryToken(Property));
    visitsRepository = module.get(getRepositoryToken(PropertyVisit));
    notificationsRepository = module.get(
      getRepositoryToken(PropertyVisitNotification),
    );
  });

  it('should register a visit and send notifications', async () => {
    const property = {
      id: 'prop-1',
      name: 'Casa Linda',
      companyId: 'company-1',
      ownerWhatsapp: '+54 9 11 1234-5678',
      owner: { user: { email: 'owner@example.com' }, userId: 'owner-1' },
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
    expect(result.notifications).toHaveLength(2);
    expect(notificationsRepository.save).toHaveBeenCalledTimes(2);

    const savedNotifications = notificationsRepository.save!.mock.calls[1][0];
    for (const notification of savedNotifications) {
      expect(notification.status).toBe(VisitNotificationStatus.SENT);
      expect(notification.sentAt).toBeInstanceOf(Date);
    }
  });

  it('should store visit details including offered amount', async () => {
    const property = {
      id: 'prop-1',
      name: 'Casa Linda',
      companyId: 'company-1',
      owner: { userId: 'owner-1' },
    } as Property;

    propertiesRepository.findOne!.mockResolvedValue(property);
    visitsRepository.create!.mockImplementation((data) => ({
      id: 'visit-1',
      ...data,
    }));
    visitsRepository.save!.mockImplementation(async (data) => data);
    notificationsRepository.save!.mockImplementation(async (data) => data);

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
});
