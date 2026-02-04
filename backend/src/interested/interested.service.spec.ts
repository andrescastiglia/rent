import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterestedService } from './interested.service';
import {
  InterestedProfile,
  InterestedOperation,
  InterestedPropertyType,
} from './entities/interested-profile.entity';
import { Property } from '../properties/entities/property.entity';

describe('InterestedService', () => {
  let service: InterestedService;
  let interestedRepository: MockRepository<InterestedProfile>;
  let propertiesRepository: MockRepository<Property>;

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
      ],
    }).compile();

    service = module.get(InterestedService);
    interestedRepository = module.get(getRepositoryToken(InterestedProfile));
    propertiesRepository = module.get(getRepositoryToken(Property));
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
    } as InterestedProfile;

    interestedRepository.create!.mockReturnValue(created);
    interestedRepository.save!.mockResolvedValue(created);

    const result = await service.create(dto as any, {
      id: 'user-1',
      role: 'admin',
      companyId: 'company-1',
    });

    expect(interestedRepository.create).toHaveBeenCalledWith({
      ...dto,
      companyId: 'company-1',
    });
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
