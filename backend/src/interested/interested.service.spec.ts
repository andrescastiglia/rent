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
import { InterestedActivity } from './entities/interested-activity.entity';
import { InterestedPropertyMatch } from './entities/interested-property-match.entity';
import { PropertyVisit } from '../properties/entities/property-visit.entity';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { SaleAgreement } from '../sales/entities/sale-agreement.entity';
import { SaleFolder } from '../sales/entities/sale-folder.entity';

describe('InterestedService', () => {
  let service: InterestedService;
  let interestedRepository: MockRepository<InterestedProfile>;
  let propertiesRepository: MockRepository<Property>;
  let stageHistoryRepository: MockRepository<InterestedStageHistory>;

  type MockRepository<T extends Record<string, any> = any> = Partial<
    Record<keyof Repository<T>, jest.Mock>
  >;

  const createMockRepository = (): MockRepository => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(async () => {
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
          useValue: {
            transaction: jest.fn(),
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
      maxAmount: 250000,
      hasPets: true,
      whiteIncome: true,
      guaranteeTypes: ['seguro_caucion'],
      propertyTypePreference: InterestedPropertyType.APARTMENT,
      operation: InterestedOperation.RENT,
    };

    const created = {
      id: 'int-1',
      ...dto,
      companyId: 'company-1',
      status: InterestedStatus.NEW,
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
      status: InterestedStatus.NEW,
    });
    expect(stageHistoryRepository.save).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it('should apply matchmaking filters based on interested profile', async () => {
    const profile = {
      id: 'int-1',
      companyId: 'company-1',
      operation: InterestedOperation.RENT,
      maxAmount: 1500,
      peopleCount: 4,
      hasPets: true,
      whiteIncome: false,
      guaranteeTypes: ['propietaria', 'seguro_caucion'],
      propertyTypePreference: InterestedPropertyType.HOUSE,
    } as InterestedProfile;

    interestedRepository.findOne!.mockResolvedValue(profile);

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    propertiesRepository.createQueryBuilder!.mockReturnValue(mockQueryBuilder);

    await service.findMatches('int-1', {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(property.max_occupants IS NULL OR property.max_occupants >= :peopleCount)',
      { peopleCount: 4 },
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'property.allows_pets = TRUE',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(property.requires_white_income = FALSE OR property.requires_white_income IS NULL)',
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      '(property.accepted_guarantee_types IS NULL OR array_length(property.accepted_guarantee_types, 1) = 0 OR property.accepted_guarantee_types && :guaranteeTypes)',
      { guaranteeTypes: ['propietaria', 'seguro_caucion'] },
    );
  });
});
