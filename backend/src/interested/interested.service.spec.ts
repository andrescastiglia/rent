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
import { I18nService } from 'nestjs-i18n';
import { PropertyOperationState } from '../properties/entities/property.entity';
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
    const folderRepo = (service as any).saleFoldersRepository as MockRepository;
    folderRepo.findOne!.mockResolvedValue({
      id: 'folder-1',
      companyId: 'company-1',
    });
    const agreementsRepo = (service as any)
      .saleAgreementsRepository as MockRepository;
    agreementsRepo.create!.mockImplementation((data) => data);
    agreementsRepo.save!.mockResolvedValue({ id: 'agr-1' });
    interestedRepository.save!.mockResolvedValue({ id: 'int-1' });
    stageHistoryRepository.create!.mockImplementation((data) => data);
    stageHistoryRepository.save!.mockResolvedValue({ id: 'hist-1' } as any);

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

    expect(result.agreement).toEqual({ id: 'agr-1' });
    expect(stageHistoryRepository.save).toHaveBeenCalled();
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
    const folderRepo = (service as any).saleFoldersRepository as MockRepository;
    folderRepo.findOne!.mockResolvedValue(null);
    await expect(
      service.convertToBuyer(
        'int-2',
        { folderId: 'missing', totalAmount: 1 } as any,
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
});
