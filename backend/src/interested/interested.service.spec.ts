import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InterestedService } from './interested.service';
import {
  InterestedProfile,
  InterestedOperation,
  InterestedPropertyType,
  InterestedStatus,
} from './entities/interested-profile.entity';
import { Property } from '../properties/entities/property.entity';
import { InterestedStageHistory } from './entities/interested-stage-history.entity';
import {
  InterestedActivity,
  InterestedActivityType,
  InterestedActivityStatus,
} from './entities/interested-activity.entity';
import {
  InterestedMatchStatus,
  InterestedPropertyMatch,
} from './entities/interested-property-match.entity';
import { PropertyReservation } from './entities/property-reservation.entity';
import { PropertyVisit } from '../properties/entities/property-visit.entity';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { SaleAgreement } from '../sales/entities/sale-agreement.entity';
import { SaleFolder } from '../sales/entities/sale-folder.entity';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { PropertyOperationState } from '../properties/entities/property.entity';
import { Buyer } from '../buyers/entities/buyer.entity';
import * as bcrypt from 'bcrypt';

describe('InterestedService', () => {
  let service: InterestedService;
  let interestedRepository: MockRepository<InterestedProfile>;
  let propertiesRepository: MockRepository<Property>;
  let stageHistoryRepository: MockRepository<InterestedStageHistory>;
  let dataSource: { transaction: jest.Mock };

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  });

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterestedService,
        {
          provide: getRepositoryToken(InterestedProfile),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Property),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(InterestedStageHistory),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(InterestedActivity),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(InterestedPropertyMatch),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(PropertyReservation),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(PropertyVisit),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Tenant),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(Buyer),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(SaleAgreement),
          useValue: createMockRepository(),
        },
        {
          provide: getRepositoryToken(SaleFolder),
          useValue: createMockRepository(),
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: I18nService,
          useValue: {
            t: jest.fn((key: string) => key),
          },
        },
      ],
    }).compile();

    service = module.get(InterestedService);
    interestedRepository = module.get(getRepositoryToken(InterestedProfile));
    propertiesRepository = module.get(getRepositoryToken(Property));
    stageHistoryRepository = module.get(
      getRepositoryToken(InterestedStageHistory),
    );
  });

  it('should create a detailed interested profile', async () => {
    const dto = {
      firstName: 'Carla',
      lastName: 'Rojas',
      phone: '+54 9 11 3333-2222',
      email: 'carla@example.com',
      peopleCount: 3,
      minAmount: 80000,
      maxAmount: 250000,
      hasPets: true,
      guaranteeTypes: ['seguro_caucion'],
      preferredCity: 'CABA',
      desiredFeatures: ['balcon', 'pileta'],
      propertyTypePreference: InterestedPropertyType.APARTMENT,
      operation: InterestedOperation.RENT,
    };

    const created = {
      id: 'int-1',
      ...dto,
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    } as InterestedProfile;

    const duplicateQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(
      duplicateQueryBuilder as any,
    );
    interestedRepository.create!.mockReturnValue(created);
    interestedRepository.save!.mockResolvedValue(created);
    stageHistoryRepository.create!.mockReturnValue({} as any);
    stageHistoryRepository.save!.mockResolvedValue({} as any);

    const result = await service.create(dto as any, {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(interestedRepository.create).toHaveBeenCalledWith({
      ...dto,
      companyId: 'company-1',
      operations: [InterestedOperation.RENT],
      status: InterestedStatus.INTERESTED,
    });
    expect(stageHistoryRepository.save).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it('should keep only properties compatible with selected operations', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      operation: InterestedOperation.RENT,
      operations: [InterestedOperation.RENT],
      maxAmount: 1500,
      peopleCount: 4,
      hasPets: true,
      guaranteeTypes: ['propietaria', 'seguro_caucion'],
      propertyTypePreference: InterestedPropertyType.HOUSE,
    } as InterestedProfile;

    interestedRepository.findOne!.mockResolvedValue(profile);

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'property-rent',
          propertyType: 'house',
          operations: ['rent'],
          units: [{ status: 'available', baseRent: 1200 }],
        },
        {
          id: 'property-sale',
          propertyType: 'house',
          operations: ['sale'],
          salePrice: 100000,
          units: [],
        },
      ]),
    };

    propertiesRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

    const matches = await service.findMatches('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('property-rent');
  });

  it('should reject create when company scope is missing', async () => {
    await expect(
      service.create({ phone: '+54 11 2222-3333' } as any, {
        id: 'user-1',
        role: 'admin',
      }),
    ).rejects.toThrow('Company scope required');
  });

  it('should reject findAll when company scope is missing', async () => {
    await expect(
      service.findAll({} as any, {
        id: 'user-1',
        role: 'admin',
      }),
    ).rejects.toThrow('Company scope required');
  });

  it('should soft delete interested profile on remove', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    (interestedRepository.softDelete as jest.Mock).mockResolvedValue(undefined);

    await service.remove('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(interestedRepository.softDelete).toHaveBeenCalledWith('int-1');
  });

  it('should throw conflict on invalid stage transition', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.TENANT,
    });

    await expect(
      service.changeStage(
        'int-1',
        { toStatus: InterestedStatus.BUYER } as any,
        { id: 'user-1', role: 'admin', companyId: 'company-1' },
      ),
    ).rejects.toThrow(
      'Interested stage can only move from interested to tenant or buyer',
    );
  });

  it('should throw not found when updating a missing match', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    });
    const matchRepo = (service as any).matchRepository as MockRepository;
    matchRepo.findOne!.mockResolvedValue(null);

    await expect(
      service.updateMatch('int-1', 'match-1', { status: 'contacted' } as any, {
        id: 'user-1',
        role: 'admin',
        companyId: 'company-1',
      }),
    ).rejects.toThrow('Match not found');
  });

  it('should return existing active reservation if already present', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    });
    propertiesRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      companyId: 'company-1',
    });
    const reservationRepo = (service as any)
      .reservationRepository as MockRepository;
    reservationRepo.findOne!.mockResolvedValue({ id: 'res-1' });

    const result = await service.createReservation(
      'int-1',
      { propertyId: 'prop-1' } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result).toEqual({ id: 'res-1' });
  });

  it('should apply filters and pagination on findAll query', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'int-1' }], 1]),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb as any);

    const result = await service.findAll(
      {
        name: 'Ana',
        phone: '11',
        operation: InterestedOperation.RENT,
        status: InterestedStatus.INTERESTED,
        page: 2,
        limit: 5,
      } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result).toEqual({
      data: [{ id: 'int-1' }],
      total: 1,
      page: 2,
      limit: 5,
    });
    expect(qb.skip).toHaveBeenCalledWith(5);
  });

  it('should save stage history when update changes status', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      phone: '+54 11 1111-1111',
      email: 'int@test.dev',
      status: InterestedStatus.INTERESTED,
      operations: [InterestedOperation.RENT],
      operation: InterestedOperation.RENT,
    });
    interestedRepository.save!.mockResolvedValue({
      id: 'int-1',
      status: InterestedStatus.BUYER,
    });
    stageHistoryRepository.create!.mockReturnValue({} as any);
    stageHistoryRepository.save!.mockResolvedValue({} as any);

    await service.update(
      'int-1',
      { status: InterestedStatus.BUYER, lostReason: 'won' } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(stageHistoryRepository.save).toHaveBeenCalled();
  });

  it('should auto-complete activity dates and support markReserved', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    });
    const activityRepo = (service as any).activityRepository as MockRepository;
    activityRepo.save!.mockResolvedValue({ id: 'act-1' });
    interestedRepository.save!.mockResolvedValue({ id: 'int-1' });
    const reservationSpy = jest
      .spyOn(service, 'createReservation')
      .mockResolvedValue({ id: 'res-1' } as any);

    const result = await service.createActivity(
      'int-1',
      {
        type: 'note',
        subject: 'Reserva',
        status: InterestedActivityStatus.COMPLETED,
        markReserved: true,
        propertyId: 'prop-1',
      } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result).toEqual({ id: 'act-1' });
    expect(reservationSpy).toHaveBeenCalled();
  });

  it('should refresh matches by soft deleting stale, updating existing and creating new', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      operation: InterestedOperation.RENT,
      operations: [InterestedOperation.RENT],
      status: InterestedStatus.INTERESTED,
    } as InterestedProfile;
    interestedRepository.findOne!.mockResolvedValue(profile);

    const matchRepo = (service as any).matchRepository as MockRepository;
    matchRepo.find!.mockResolvedValue([
      { id: 'stale-1', propertyId: 'prop-stale' },
      { id: 'existing-1', propertyId: 'prop-keep' },
    ]);
    matchRepo.create!.mockImplementation((data) => ({ id: 'new-1', ...data }));
    matchRepo.save!.mockResolvedValue([]);
    const listSpy = jest.spyOn(service, 'listMatches').mockResolvedValue([]);
    jest
      .spyOn(service, 'findMatches')
      .mockResolvedValue([{ id: 'prop-keep' }, { id: 'prop-new' }] as any);
    jest.spyOn(service as any, 'calculateMatchScore').mockReturnValue(88);
    jest
      .spyOn(service as any, 'buildMatchReasons')
      .mockReturnValue(['budget', 'operation']);

    await service.refreshMatches('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(matchRepo.softDelete).toHaveBeenCalledWith(['stale-1']);
    expect(matchRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing-1', score: 88 }),
        expect.objectContaining({
          id: 'new-1',
          propertyId: 'prop-new',
          status: InterestedMatchStatus.SUGGESTED,
          companyId: 'company-1',
        }),
      ]),
    );
    expect(listSpy).toHaveBeenCalledWith('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });
  });

  it('should list matches with expected query options', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    const matchRepo = (service as any).matchRepository as MockRepository;
    matchRepo.find!.mockResolvedValue([{ id: 'm-1' }]);

    const result = await service.listMatches('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(matchRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interestedProfileId: 'int-1',
          companyId: 'company-1',
        }),
        relations: ['property'],
      }),
    );
    expect(result).toEqual([{ id: 'm-1' }]);
  });

  it('should change stage to tenant using existing converted tenant id', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
      convertedToTenantId: 'tenant-1',
    });
    interestedRepository.save!.mockResolvedValue({
      id: 'int-1',
      status: InterestedStatus.TENANT,
      convertedToTenantId: 'tenant-1',
    });
    stageHistoryRepository.create!.mockImplementation((data) => data);
    stageHistoryRepository.save!.mockResolvedValue({ id: 'hist-1' } as any);

    const result = await service.changeStage(
      'int-1',
      { toStatus: InterestedStatus.TENANT, reason: 'approved' } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.status).toBe(InterestedStatus.TENANT);
    expect(stageHistoryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        interestedProfileId: 'int-1',
        fromStatus: InterestedStatus.INTERESTED,
        toStatus: InterestedStatus.TENANT,
      }),
    );
  });

  it('should throw when creating reservation for unknown property', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    propertiesRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.createReservation('int-1', { propertyId: 'missing' } as any, {
        id: 'user-1',
        role: 'admin',
        companyId: 'company-1',
      }),
    ).rejects.toThrow('Property not found');
  });

  it('should create reservation, update property state and log activity', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    propertiesRepository.findOne!.mockResolvedValue({
      id: 'prop-1',
      companyId: 'company-1',
    });
    const reservationRepo = (service as any)
      .reservationRepository as MockRepository;
    reservationRepo.findOne!.mockResolvedValue(null);
    reservationRepo.create!.mockImplementation((data) => data);
    reservationRepo.save!.mockResolvedValue({ id: 'res-1' } as any);
    propertiesRepository.update!.mockResolvedValue({ affected: 1 } as any);
    const activitySpy = jest
      .spyOn(service, 'createActivity')
      .mockResolvedValue({ id: 'act-1' } as any);

    const result = await service.createReservation(
      'int-1',
      { propertyId: 'prop-1', notes: 'reserve now' } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result).toEqual({ id: 'res-1' });
    expect(propertiesRepository.update).toHaveBeenCalledWith('prop-1', {
      operationState: PropertyOperationState.RESERVED,
    });
    expect(activitySpy).toHaveBeenCalled();
  });

  it('should build summary and timeline entries', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
    } as InterestedProfile;
    interestedRepository.findOne!.mockResolvedValue(profile);
    stageHistoryRepository.find!.mockResolvedValue([
      {
        id: 's1',
        fromStatus: InterestedStatus.INTERESTED,
        toStatus: InterestedStatus.TENANT,
        reason: 'won',
        changedAt: new Date('2025-01-01T10:00:00.000Z'),
      },
    ]);
    const activityRepo = (service as any).activityRepository as MockRepository;
    activityRepo.find!.mockResolvedValue([
      {
        id: 'a1',
        type: 'note',
        subject: 'contact',
        status: InterestedActivityStatus.COMPLETED,
        body: 'called',
        createdAt: new Date('2025-01-03T10:00:00.000Z'),
      },
    ]);
    const matchRepo = (service as any).matchRepository as MockRepository;
    matchRepo.find!.mockResolvedValue([
      {
        id: 'm1',
        status: InterestedMatchStatus.SUGGESTED,
        propertyId: 'p1',
        property: { name: 'Depto 1' },
        score: 90,
        updatedAt: new Date('2025-01-02T10:00:00.000Z'),
      },
    ]);
    const visitsRepo = (service as any)
      .propertyVisitsRepository as MockRepository;
    visitsRepo.find!.mockResolvedValue([
      {
        id: 'v1',
        propertyId: 'p1',
        property: { name: 'Depto 1' },
        comments: 'ok',
        hasOffer: false,
        visitedAt: new Date('2025-01-04T10:00:00.000Z'),
      },
    ]);

    const summary = await service.getSummary('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });
    const timeline = await service.getTimeline('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(summary.profile.id).toBe('int-1');
    expect(summary.activities).toHaveLength(1);
    expect(timeline).toHaveLength(4);
    expect(timeline[0].id).toBe('v1');
  });

  it('should update activity and auto-set completedAt when status becomes completed', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    const activityRepo = (service as any).activityRepository as MockRepository;
    activityRepo.findOne!.mockResolvedValue({
      id: 'act-1',
      interestedProfileId: 'int-1',
      status: InterestedActivityStatus.PENDING,
      completedAt: null,
    });
    activityRepo.save!.mockImplementation(async (activity) => activity);

    const result = await service.updateActivity(
      'int-1',
      'act-1',
      { status: InterestedActivityStatus.COMPLETED } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.status).toBe(InterestedActivityStatus.COMPLETED);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('should throw not found when updateActivity target does not exist', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    const activityRepo = (service as any).activityRepository as MockRepository;
    activityRepo.findOne!.mockResolvedValue(null);

    await expect(
      service.updateActivity(
        'int-1',
        'missing',
        { status: InterestedActivityStatus.COMPLETED } as any,
        { id: 'user-1', role: 'admin', companyId: 'company-1' },
      ),
    ).rejects.toThrow('Activity not found');
  });

  it('should set contactedAt and create activity when updating match to CONTACTED', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    });
    const matchRepo = (service as any).matchRepository as MockRepository;
    matchRepo.findOne!.mockResolvedValue({
      id: 'match-1',
      interestedProfileId: 'int-1',
      companyId: 'company-1',
      propertyId: 'prop-1',
      status: InterestedMatchStatus.SUGGESTED,
    });
    matchRepo.save!.mockImplementation(async (match) => match);
    const activitySpy = jest
      .spyOn(service, 'createActivity')
      .mockResolvedValue({ id: 'act-1' } as any);

    const result = await service.updateMatch(
      'int-1',
      'match-1',
      { status: InterestedMatchStatus.CONTACTED } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.contactedAt).toBeInstanceOf(Date);
    expect(activitySpy).toHaveBeenCalledWith(
      'int-1',
      expect.objectContaining({
        type: InterestedActivityType.WHATSAPP,
      }),
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );
  });

  it('should list reservations with expected criteria', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
    });
    const reservationRepo = (service as any)
      .reservationRepository as MockRepository;
    reservationRepo.find!.mockResolvedValue([{ id: 'res-1' }]);

    const result = await service.listReservations('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(reservationRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interestedProfileId: 'int-1',
          companyId: 'company-1',
        }),
        relations: ['property'],
      }),
    );
    expect(result).toEqual([{ id: 'res-1' }]);
  });

  it('should find potential duplicates and map count/profile ids', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      having: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          phone: '+5491112345678',
          email: 'a@test.dev',
          count: '2',
          profileids: ['int-1', 'int-2'],
        },
      ]),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb as any);

    const result = await service.findPotentialDuplicates({
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(result).toEqual([
      {
        phone: '+5491112345678',
        email: 'a@test.dev',
        count: 2,
        profileIds: ['int-1', 'int-2'],
      },
    ]);
  });

  it('should convert profile to buyer when folder exists', async () => {
    interestedRepository.findOne!.mockResolvedValue({
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
      phone: '+5491112345678',
      notes: 'profile notes',
      firstName: 'Ana',
      lastName: 'Diaz',
    });
    const usersRepo = (service as any).usersRepository as MockRepository;
    usersRepo.findOne!.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt' as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const userRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const buyerRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'buyer-1' }),
    };
    const folderRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'folder-1',
        companyId: 'company-1',
      }),
    };
    const agreementsRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'agr-1' }),
    };
    const profileRepo = { save: jest.fn().mockResolvedValue({ id: 'int-1' }) };
    const historyRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'hist-1' }),
    };
    const activityRepo = {
      create: jest.fn((data) => data),
      save: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === User) return userRepo;
          if (entity === Buyer) return buyerRepo;
          if (entity === SaleFolder) return folderRepo;
          if (entity === SaleAgreement) return agreementsRepo;
          if (entity === InterestedProfile) return profileRepo;
          if (entity === InterestedStageHistory) return historyRepo;
          if (entity === InterestedActivity) return activityRepo;
          return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
        },
      }),
    );

    const result = await service.convertToBuyer(
      'int-1',
      {
        folderId: 'folder-1',
        totalAmount: 100000,
        installmentAmount: 10000,
        installmentCount: 10,
        startDate: '2025-01-01',
      } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.buyer).toEqual({ id: 'buyer-1' });
    expect(result.agreement).toEqual({ id: 'agr-1' });
    expect(historyRepo.save).toHaveBeenCalled();
  });

  it('should compute metrics summary and activity by agent', async () => {
    interestedRepository.find!.mockResolvedValue([
      {
        id: 'int-1',
        status: InterestedStatus.INTERESTED,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      {
        id: 'int-2',
        status: InterestedStatus.TENANT,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
      },
    ]);
    const activityRepo = (service as any).activityRepository as MockRepository;
    const activityQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ userId: 'agent-1', activityCount: '3' }]),
    };
    activityRepo.createQueryBuilder!.mockReturnValue(activityQb as any);
    const stageQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([{ userId: 'agent-1', wonCount: '1' }]),
    };
    stageHistoryRepository.createQueryBuilder!.mockReturnValue(stageQb as any);

    const result = await service.getMetrics({
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(result.totalLeads).toBe(2);
    expect(result.byStage[InterestedStatus.TENANT]).toBe(1);
    expect(result.conversionRate).toBe(50);
    expect(result.activityByAgent).toEqual([
      { userId: 'agent-1', activityCount: 3, wonCount: 1 },
    ]);
  });

  it('should convert to tenant and persist related entities in one transaction', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
      convertedToTenantId: null,
      firstName: ' Ana ',
      lastName: ' Diaz ',
      phone: '+54 9 11 1234-5678',
      notes: 'lead note',
      qualificationLevel: null,
    } as any;
    interestedRepository
      .findOne!.mockResolvedValueOnce(profile)
      .mockResolvedValueOnce({
        ...profile,
        status: InterestedStatus.TENANT,
        convertedToTenantId: 'tenant-1',
      });

    const usersRepo = (service as any).usersRepository as MockRepository;
    usersRepo.findOne!.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt' as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const userRepo = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'user-1', email: 'u@test.dev' }),
    };
    const tenantRepo = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
    };
    const profileRepo = { save: jest.fn().mockResolvedValue({}) };
    const historyRepo = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'h-1' }),
    };
    const activityRepo = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue({ id: 'a-1' }),
    };
    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === User) return userRepo;
          if (entity === Tenant) return tenantRepo;
          if (entity === InterestedProfile) return profileRepo;
          if (entity === InterestedStageHistory) return historyRepo;
          if (entity === InterestedActivity) return activityRepo;
          return { create: jest.fn(), save: jest.fn() };
        },
      }),
    );

    const result = await service.convertToTenant(
      'int-1',
      { dni: '12345678' } as any,
      { id: 'admin-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.tenant).toEqual({ id: 'tenant-1' });
    expect(userRepo.create).toHaveBeenCalled();
    expect(tenantRepo.create).toHaveBeenCalled();
    expect(profileRepo.save).toHaveBeenCalled();
  });

  it('should reject convertToTenant when already converted or duplicate user exists', async () => {
    interestedRepository.findOne!.mockResolvedValueOnce({
      id: 'int-1',
      companyId: 'company-1',
      convertedToTenantId: 'tenant-1',
    });
    await expect(
      service.convertToTenant('int-1', {} as any, {
        id: 'admin-1',
        role: 'admin',
        companyId: 'company-1',
      }),
    ).rejects.toThrow('already converted');

    interestedRepository.findOne!.mockResolvedValueOnce({
      id: 'int-2',
      companyId: 'company-1',
      convertedToTenantId: null,
      phone: '+549111111111',
    });
    const usersRepo = (service as any).usersRepository as MockRepository;
    usersRepo.findOne!.mockResolvedValue({ id: 'u-1' });
    await expect(
      service.convertToTenant('int-2', {} as any, {
        id: 'admin-1',
        role: 'admin',
        companyId: 'company-1',
      }),
    ).rejects.toThrow('already exists');
  });

  it('should reject convertToBuyer when already converted or folder not found', async () => {
    interestedRepository.findOne!.mockResolvedValueOnce({
      id: 'int-1',
      companyId: 'company-1',
      convertedToSaleAgreementId: 'agr-1',
    });
    await expect(
      service.convertToBuyer(
        'int-1',
        { folderId: 'f-1', totalAmount: 1 } as any,
        { id: 'admin-1', role: 'admin', companyId: 'company-1' },
      ),
    ).rejects.toThrow('already converted');

    interestedRepository.findOne!.mockResolvedValueOnce({
      id: 'int-2',
      companyId: 'company-1',
      convertedToSaleAgreementId: null,
      phone: '1',
    });
    const usersRepo = (service as any).usersRepository as MockRepository;
    usersRepo.findOne!.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt' as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    dataSource.transaction.mockImplementation(async (cb) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === User) {
            return {
              create: jest.fn((data) => data),
              save: jest.fn().mockResolvedValue({ id: 'user-2' }),
            };
          }
          if (entity === Buyer) {
            return {
              create: jest.fn((data) => data),
              save: jest.fn().mockResolvedValue({ id: 'buyer-2' }),
            };
          }
          if (entity === SaleFolder) {
            return {
              findOne: jest.fn().mockResolvedValue(null),
            };
          }
          return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
        },
      }),
    );

    await expect(
      service.convertToBuyer(
        'int-2',
        {
          folderId: 'missing',
          totalAmount: 1,
          installmentAmount: 1,
          installmentCount: 1,
          startDate: '2025-01-01',
        } as any,
        { id: 'admin-1', role: 'admin', companyId: 'company-1' },
      ),
    ).rejects.toThrow('Sale folder not found');
  });

  it('should require company scope for duplicates and metrics', async () => {
    await expect(
      service.findPotentialDuplicates({
        id: 'admin-1',
        role: 'admin',
      }),
    ).rejects.toThrow('Company scope required');

    await expect(
      service.getMetrics({
        id: 'admin-1',
        role: 'admin',
      }),
    ).rejects.toThrow('Company scope required');
  });

  it('should cover private operation and scoring helpers', () => {
    const serviceAny = service as any;
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.APARTMENT),
    ).toBe('apartment');
    expect(serviceAny.mapPreferenceToPropertyType(undefined)).toBeNull();

    expect(
      serviceAny.normalizeOperations([InterestedOperation.SALE], undefined),
    ).toEqual({
      operations: [InterestedOperation.SALE],
      primaryOperation: InterestedOperation.SALE,
    });
    expect(
      serviceAny.normalizeOperations(
        undefined,
        undefined,
        [InterestedOperation.RENT, InterestedOperation.SALE],
        InterestedOperation.SALE,
      ),
    ).toEqual({
      operations: [InterestedOperation.RENT, InterestedOperation.SALE],
      primaryOperation: InterestedOperation.SALE,
    });

    const profile = {
      operations: [InterestedOperation.RENT],
      operation: InterestedOperation.RENT,
      minAmount: 100,
      maxAmount: 200,
      peopleCount: 2,
      hasPets: true,
      guaranteeTypes: ['seguro'],
      desiredFeatures: ['pileta'],
      preferredCity: 'caba',
      preferredZones: ['palermo'],
      propertyTypePreference: InterestedPropertyType.APARTMENT,
    };
    const property = {
      propertyType: 'apartment',
      rentPrice: null,
      salePrice: null,
      units: [{ status: 'available', baseRent: 150 }],
      operations: undefined,
      addressCity: 'CABA',
      addressState: 'BA',
      addressStreet: 'Palermo',
      addressPostalCode: '1000',
      maxOccupants: 3,
      allowsPets: true,
      acceptedGuaranteeTypes: ['seguro'],
      amenities: ['pileta'],
      features: [{ name: 'vista', value: 'frente' }],
    };

    expect(serviceAny.getAvailableRentPrice(property)).toBe(150);
    expect(serviceAny.isOperationCompatible(profile, property)).toBe(true);
    expect(serviceAny.isPriceInRange(profile, property)).toBe(true);
    expect(serviceAny.matchesGuaranteeTypes(profile, property)).toBe(true);
    expect(serviceAny.matchesDesiredFeatures(['pileta'], property)).toBe(true);
    expect(
      serviceAny.buildPropertyFeaturePool(property).has('vista:frente'),
    ).toBe(true);
    expect(serviceAny.calculateMatchScore(profile, property)).toBeGreaterThan(
      0,
    );
    expect(
      serviceAny.buildMatchReasons(profile, property).length,
    ).toBeGreaterThan(0);
  });

  it('should cover private defaults and language resolution helpers', () => {
    const serviceAny = service as any;
    expect(
      serviceAny.resolveName({ firstName: ' ', lastName: ' ' }).fullName,
    ).toBe(
      'interested.names.defaultFirstName interested.names.defaultLastName',
    );
    expect(
      serviceAny.buildFallbackEmail({ phone: '+54 9 11 1234-5678', id: 'x' }),
    ).toContain('interesado.5491112345678');
    expect(serviceAny.generateRandomPassword()).toMatch(/^Tmp!/);
    expect(serviceAny.resolveSupportedLang('en-US')).toBe('en');
    expect(serviceAny.resolveSupportedLang('pt-BR')).toBe('pt');
    expect(serviceAny.resolveSupportedLang('fr-FR')).toBe('es');
  });

  it('should apply propertyTypePreference and qualificationLevel filters in findAll', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb as any);

    await service.findAll(
      {
        propertyTypePreference: InterestedPropertyType.HOUSE,
        qualificationLevel: 'mql',
        page: 1,
        limit: 10,
      } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    const andWhereCalls = qb.andWhere.mock.calls.map((c: any) => c[0]);
    expect(andWhereCalls).toContain(
      'interested.property_type_preference = :propertyTypePreference',
    );
    expect(andWhereCalls).toContain(
      'interested.qualification_level = :qualificationLevel',
    );
  });

  it('should mapPreferenceToPropertyType for all types', () => {
    const serviceAny = service as any;
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.HOUSE),
    ).toBe('house');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.COMMERCIAL),
    ).toBe('commercial');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.OFFICE),
    ).toBe('office');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.WAREHOUSE),
    ).toBe('warehouse');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.LAND),
    ).toBe('land');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.PARKING),
    ).toBe('parking');
    expect(
      serviceAny.mapPreferenceToPropertyType(InterestedPropertyType.OTHER),
    ).toBe('other');
  });

  it('should validateDuplicates with phone-only, email-only, excludeId, and no-data', async () => {
    const serviceAny = service as any;

    // no phone & no email → early return
    await expect(
      serviceAny.validateDuplicates('company-1'),
    ).resolves.toBeUndefined();

    // phone only
    const qb1 = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb1 as any);
    await serviceAny.validateDuplicates('company-1', '+54111111', undefined);
    const andWheres1 = qb1.andWhere.mock.calls.map((c: any) => c[0]);
    expect(andWheres1).toContain('interested.phone = :phone');

    // email only
    const qb2 = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb2 as any);
    await serviceAny.validateDuplicates('company-1', undefined, 'a@b.com');
    const andWheres2 = qb2.andWhere.mock.calls.map((c: any) => c[0]);
    expect(andWheres2).toContain('interested.email = :email');

    // with excludeId
    const qb3 = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb3 as any);
    await serviceAny.validateDuplicates(
      'company-1',
      '+54111111',
      'a@b.com',
      'id-1',
    );
    const andWheres3 = qb3.andWhere.mock.calls.map((c: any) => c[0]);
    expect(andWheres3).toContain('interested.id != :excludeId');

    // duplicate found → ConflictException
    const qb4 = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 'dup-1' }),
    };
    interestedRepository.createQueryBuilder!.mockReturnValue(qb4 as any);
    await expect(
      serviceAny.validateDuplicates('company-1', '+54111111'),
    ).rejects.toThrow('Potential duplicate detected');
  });

  it('should resolvePropertyOperations fallback when no operations array', () => {
    const serviceAny = service as any;

    // has both rent and sale prices
    expect(
      serviceAny.resolvePropertyOperations({
        operations: null,
        units: [{ status: 'available', baseRent: 100 }],
        salePrice: 5000,
      }),
    ).toEqual(['rent', 'sale']);

    // sale only
    expect(
      serviceAny.resolvePropertyOperations({
        operations: null,
        units: [],
        salePrice: 5000,
        rentPrice: null,
      }),
    ).toEqual(['sale']);

    // rent only via rentPrice
    expect(
      serviceAny.resolvePropertyOperations({
        operations: null,
        units: [],
        salePrice: null,
        rentPrice: 1000,
      }),
    ).toEqual(['rent']);

    // no prices → default rent
    expect(
      serviceAny.resolvePropertyOperations({
        operations: null,
        units: [],
        salePrice: null,
        rentPrice: null,
      }),
    ).toEqual(['rent']);

    // explicit operations array
    expect(
      serviceAny.resolvePropertyOperations({
        operations: ['sale'],
        units: [],
        salePrice: 5000,
      }),
    ).toEqual(['sale']);
  });

  it('should isOperationCompatible handle SALE operation', () => {
    const serviceAny = service as any;
    const saleProfile = {
      operations: [InterestedOperation.SALE],
      operation: InterestedOperation.SALE,
    };
    const saleProperty = {
      operations: ['sale'],
      salePrice: 100000,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.isOperationCompatible(saleProfile, saleProperty)).toBe(
      true,
    );

    // SALE profile but property has no sale price
    const noSaleProperty = {
      operations: ['sale'],
      salePrice: null,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.isOperationCompatible(saleProfile, noSaleProperty)).toBe(
      false,
    );
  });

  it('should getComparablePrices include sale prices', () => {
    const serviceAny = service as any;
    const profile = {
      operations: [InterestedOperation.SALE],
      operation: InterestedOperation.SALE,
    };
    const property = {
      operations: ['sale'],
      salePrice: 50000,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.getComparablePrices(profile, property)).toEqual([50000]);

    // both operations
    const bothProfile = {
      operations: [InterestedOperation.RENT, InterestedOperation.SALE],
      operation: InterestedOperation.RENT,
    };
    const bothProperty = {
      operations: ['rent', 'sale'],
      salePrice: 50000,
      units: [{ status: 'available', baseRent: 1000 }],
      rentPrice: null,
    };
    expect(serviceAny.getComparablePrices(bothProfile, bothProperty)).toEqual([
      1000, 50000,
    ]);
  });

  it('should ensureCompleteBuyerAgreementData throw on incomplete data', () => {
    const serviceAny = service as any;
    expect(() =>
      serviceAny.ensureCompleteBuyerAgreementData({
        folderId: 'f-1',
        totalAmount: 100,
        // missing installmentAmount, installmentCount, startDate
      }),
    ).toThrow('Sale agreement conversion requires');
  });

  it('should changeStage INTERESTED → TENANT without existing convertedToTenantId', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
      convertedToTenantId: null,
      firstName: 'Juan',
      lastName: 'Perez',
      phone: '+54 9 11 5555-5555',
      qualificationLevel: null,
    } as any;

    interestedRepository
      .findOne!.mockResolvedValueOnce(profile) // changeStage → findOne
      .mockResolvedValueOnce(profile) // convertToTenant → findOne
      .mockResolvedValueOnce({ ...profile, status: InterestedStatus.TENANT }) // convertToTenant → final findOne
      .mockResolvedValueOnce({ ...profile, status: InterestedStatus.TENANT }); // createActivity → findOne

    const usersRepo = (service as any).usersRepository;
    usersRepo.findOne!.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt' as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const userRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@b.com' }),
    };
    const tenantRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
    };
    const profileRepo = { save: jest.fn().mockResolvedValue({}) };
    const historyRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    const activityRepoTx = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === User) return userRepo;
          if (entity === Tenant) return tenantRepo;
          if (entity === InterestedProfile) return profileRepo;
          if (entity === InterestedStageHistory) return historyRepo;
          if (entity === InterestedActivity) return activityRepoTx;
          return { create: jest.fn(), save: jest.fn() };
        },
      }),
    );

    const result = await service.changeStage(
      'int-1',
      {
        toStatus: InterestedStatus.TENANT,
        reason: 'approved with note',
      } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.status).toBe(InterestedStatus.TENANT);
    // reason provided → should create an activity
    const activityRepo = (service as any).activityRepository;
    expect(activityRepo.save).toHaveBeenCalled();
  });

  it('should changeStage INTERESTED → BUYER', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    } as any;
    interestedRepository.findOne!.mockResolvedValue(profile);
    interestedRepository.save!.mockResolvedValue({
      ...profile,
      status: InterestedStatus.BUYER,
    });
    stageHistoryRepository.create!.mockImplementation((d: any) => d);
    stageHistoryRepository.save!.mockResolvedValue({});

    const result = await service.changeStage(
      'int-1',
      { toStatus: InterestedStatus.BUYER } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result.status).toBe(InterestedStatus.BUYER);
    expect(stageHistoryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: InterestedStatus.BUYER,
      }),
    );
  });

  it('should convertToBuyer without agreement data', async () => {
    interestedRepository
      .findOne!.mockResolvedValueOnce({
        id: 'int-1',
        companyId: 'company-1',
        status: InterestedStatus.INTERESTED,
        convertedToBuyerId: null,
        convertedToSaleAgreementId: null,
        phone: '+5491112345678',
        firstName: 'Ana',
        lastName: 'Diaz',
        notes: 'notes',
      })
      .mockResolvedValueOnce({
        id: 'int-1',
        status: InterestedStatus.BUYER,
      });

    const usersRepo = (service as any).usersRepository;
    usersRepo.findOne!.mockResolvedValue(null);

    jest.spyOn(bcrypt, 'genSalt').mockResolvedValue('salt' as never);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

    const userRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };
    const buyerRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({ id: 'buyer-1' }),
    };
    const profileRepo = { save: jest.fn().mockResolvedValue({}) };
    const historyRepo = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    const activityRepoTx = {
      create: jest.fn((d: any) => d),
      save: jest.fn().mockResolvedValue({}),
    };
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === User) return userRepo;
          if (entity === Buyer) return buyerRepo;
          if (entity === InterestedProfile) return profileRepo;
          if (entity === InterestedStageHistory) return historyRepo;
          if (entity === InterestedActivity) return activityRepoTx;
          return { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
        },
      }),
    );

    const result = await service.convertToBuyer('int-1', {} as any, {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(result.buyer).toEqual({ id: 'buyer-1' });
    expect(result.agreement).toBeNull();
  });

  it('should calculateMatchScore consider zones and occupants', () => {
    const serviceAny = service as any;
    const profile = {
      operations: [InterestedOperation.RENT],
      operation: InterestedOperation.RENT,
      propertyTypePreference: InterestedPropertyType.APARTMENT,
      preferredCity: 'caba',
      preferredZones: ['Palermo'],
      minAmount: null,
      maxAmount: null,
      peopleCount: 2,
      hasPets: false,
      guaranteeTypes: [],
      desiredFeatures: [],
    };
    const property = {
      propertyType: 'apartment',
      operations: ['rent'],
      addressCity: 'CABA',
      addressState: 'BA',
      addressStreet: 'Palermo Street',
      addressPostalCode: '1000',
      rentPrice: 1000,
      salePrice: null,
      units: [],
      maxOccupants: 3,
      allowsPets: false,
      acceptedGuaranteeTypes: [],
      amenities: [],
      features: [],
    };
    const score = serviceAny.calculateMatchScore(profile, property);
    expect(score).toBeGreaterThan(0);

    // not enough occupants
    const smallProperty = { ...property, maxOccupants: 1 };
    const score2 = serviceAny.calculateMatchScore(profile, smallProperty);
    expect(score2).toBeLessThan(score);
  });

  it('should changeStage return same profile when toStatus equals current status', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      status: InterestedStatus.INTERESTED,
    };
    interestedRepository.findOne!.mockResolvedValue(profile);

    const result = await service.changeStage(
      'int-1',
      { toStatus: InterestedStatus.INTERESTED } as any,
      { id: 'user-1', role: 'admin', companyId: 'company-1' },
    );

    expect(result).toEqual(profile);
    expect(interestedRepository.save).not.toHaveBeenCalled();
  });

  it('should t() fallback to es when non-es translation returns the key', () => {
    const serviceAny = service as any;
    const i18nService = serviceAny.i18n;
    // Mock t returning key for 'en', then returning translation for 'es'
    i18nService.t
      .mockReturnValueOnce('some.key') // same as key → fallback
      .mockReturnValueOnce('traducción');

    jest
      .spyOn(I18nContext, 'current')
      .mockReturnValue({ lang: 'en' } as unknown as I18nContext<unknown>);

    const result = serviceAny.t('some.key');
    expect(result).toBe('traducción');
    expect(i18nService.t).toHaveBeenCalledWith(
      'some.key',
      expect.objectContaining({ lang: 'es' }),
    );

    jest.restoreAllMocks();
  });

  it('should getAvailableRentPrice use rentPrice when set', () => {
    const serviceAny = service as any;
    expect(
      serviceAny.getAvailableRentPrice({ rentPrice: 500, units: [] }),
    ).toBe(500);
    expect(
      serviceAny.getAvailableRentPrice({ rentPrice: null, units: [] }),
    ).toBeNull();
  });

  it('should hasEnoughOccupants handle null values', () => {
    const serviceAny = service as any;
    expect(serviceAny.hasEnoughOccupants({ peopleCount: null }, {})).toBe(true);
    expect(
      serviceAny.hasEnoughOccupants({ peopleCount: 2 }, { maxOccupants: null }),
    ).toBe(true);
    expect(
      serviceAny.hasEnoughOccupants({ peopleCount: 5 }, { maxOccupants: 3 }),
    ).toBe(false);
  });

  it('should isPriceInRange return false when no prices available', () => {
    const serviceAny = service as any;
    const profile = {
      operations: [InterestedOperation.SALE],
      operation: InterestedOperation.SALE,
      minAmount: 100,
      maxAmount: 200,
    };
    // no sale price set, so no comparable prices
    const property = {
      operations: ['sale'],
      salePrice: null,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.isPriceInRange(profile, property)).toBe(false);

    // price below min
    const propertyLow = {
      operations: ['sale'],
      salePrice: 50,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.isPriceInRange(profile, propertyLow)).toBe(false);

    // price above max
    const propertyHigh = {
      operations: ['sale'],
      salePrice: 300,
      units: [],
      rentPrice: null,
    };
    expect(serviceAny.isPriceInRange(profile, propertyHigh)).toBe(false);
  });
});
