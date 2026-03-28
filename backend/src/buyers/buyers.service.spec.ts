import { ConflictException, NotFoundException } from '@nestjs/common';
import { BuyersService } from './buyers.service';
import { InterestedStatus } from '../interested/entities/interested-profile.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('BuyersService', () => {
  let service: BuyersService;
  let buyersRepository: any;
  let usersRepository: any;
  let interestedProfilesRepository: any;

  const mockBuyer = {
    id: 'buyer-1',
    userId: 'user-1',
    companyId: 'company-1',
    interestedProfileId: null,
    dni: '12345678',
    notes: null,
    user: {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.dev',
      phone: '+123',
    },
    interestedProfile: null,
  };

  const makeQb = () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return qb;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

    buyersRepository = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => ({ id: 'buyer-1', ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => makeQb()),
    };
    usersRepository = {
      create: jest.fn((dto: any) => dto),
      save: jest.fn((entity: any) => ({ id: 'user-1', ...entity })),
      findOne: jest.fn(),
    };
    interestedProfilesRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    service = new BuyersService(
      buyersRepository,
      usersRepository,
      interestedProfilesRepository,
    );
  });

  describe('findAll', () => {
    it('returns paginated buyers with default filters', async () => {
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([[mockBuyer], 1]);
      buyersRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({} as any, 'company-1');

      expect(result).toEqual({
        data: [mockBuyer],
        total: 1,
        page: 1,
        limit: 100,
      });
    });

    it('applies name, email and phone filters', async () => {
      const qb = makeQb();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      buyersRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll(
        { name: 'John', email: 'john', phone: '123', page: 2, limit: 5 },
        'company-1',
      );

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('name'),
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('email'),
        expect.any(Object),
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('phone'),
        expect.any(Object),
      );
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  describe('findOne', () => {
    it('returns buyer when found', async () => {
      buyersRepository.findOne.mockResolvedValue(mockBuyer);
      const result = await service.findOne('buyer-1', 'company-1');
      expect(result).toEqual(mockBuyer);
    });

    it('scopes lookup to the buyer user when userId is provided', async () => {
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      await service.findOne('buyer-1', 'company-1', 'user-1');

      expect(buyersRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'buyer-1',
            companyId: 'company-1',
            userId: 'user-1',
          }),
        }),
      );
    });

    it('throws NotFoundException when buyer not found', async () => {
      buyersRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates buyer without interested profile', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      const result = await service.create(
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.dev',
          phone: '+123',
          dni: '12345678',
        } as any,
        'company-1',
      );

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          email: 'john@test.dev',
          firstName: 'John',
          lastName: 'Doe',
        }),
      );
      expect(result).toEqual(mockBuyer);
    });

    it('normalizes email before checking duplicates and persisting', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      await service.create(
        {
          firstName: 'John',
          lastName: 'Doe',
          email: '  John.Smith@Example.COM  ',
        } as any,
        'company-1',
      );

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'john.smith@example.com' },
      });
      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'john.smith@example.com',
        }),
      );
    });

    it('creates buyer with interested profile', async () => {
      const profile = {
        id: 'ip-1',
        companyId: 'company-1',
        convertedToBuyerId: null,
      };
      usersRepository.findOne.mockResolvedValue(null);
      interestedProfilesRepository.findOne.mockResolvedValue(profile);
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      await service.create(
        {
          firstName: 'John',
          lastName: 'Doe',
          interestedProfileId: 'ip-1',
        } as any,
        'company-1',
      );

      expect(interestedProfilesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          convertedToBuyerId: 'buyer-1',
          status: InterestedStatus.BUYER,
        }),
      );
    });

    it('throws ConflictException when email already exists', async () => {
      usersRepository.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          { firstName: 'A', lastName: 'B', email: 'dup@test.dev' } as any,
          'company-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when interested profile not found', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      interestedProfilesRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          {
            firstName: 'A',
            lastName: 'B',
            interestedProfileId: 'missing',
          } as any,
          'company-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when interested profile already linked', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      interestedProfilesRepository.findOne.mockResolvedValue({
        id: 'ip-1',
        convertedToBuyerId: 'other-buyer',
      });

      await expect(
        service.create(
          {
            firstName: 'A',
            lastName: 'B',
            interestedProfileId: 'ip-1',
          } as any,
          'company-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('generates random password when none provided', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      await service.create(
        { firstName: 'A', lastName: 'B' } as any,
        'company-1',
      );

      expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 'salt');
    });

    it('creates buyer with null email when email is empty', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      buyersRepository.findOne.mockResolvedValue(mockBuyer);

      await service.create(
        { firstName: 'A', lastName: 'B', email: '' } as any,
        'company-1',
      );

      expect(usersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: null }),
      );
    });
  });

  describe('update', () => {
    it('updates buyer fields', async () => {
      buyersRepository.findOne.mockResolvedValue({ ...mockBuyer });
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await service.update(
        'buyer-1',
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.dev',
          phone: '+456',
          dni: '87654321',
          notes: 'updated',
        } as any,
        'company-1',
      );

      expect(usersRepository.save).toHaveBeenCalled();
      expect(buyersRepository.save).toHaveBeenCalled();
    });

    it('normalizes updated email before checking duplicates and persisting', async () => {
      buyersRepository.findOne.mockResolvedValue({ ...mockBuyer });
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await service.update(
        'buyer-1',
        { email: '  Jane.Doe@Example.COM  ' } as any,
        'company-1',
      );

      expect(usersRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'jane.doe@example.com' },
      });
      expect(usersRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane.doe@example.com',
        }),
      );
    });

    it('throws ConflictException when updating email to existing one', async () => {
      buyersRepository.findOne.mockResolvedValue({ ...mockBuyer });
      usersRepository.findOne.mockResolvedValue({
        id: 'other-user',
        email: 'taken@test.dev',
      });

      await expect(
        service.update(
          'buyer-1',
          { email: 'taken@test.dev' } as any,
          'company-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('allows email update when it belongs to the same user', async () => {
      buyersRepository.findOne.mockResolvedValue({ ...mockBuyer });
      usersRepository.findOne.mockResolvedValue({ id: 'user-1' });
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await expect(
        service.update(
          'buyer-1',
          { email: 'john@test.dev' } as any,
          'company-1',
        ),
      ).resolves.toBeDefined();
    });

    it('unlinks previous interested profile and links new one', async () => {
      const prevProfile = {
        id: 'ip-old',
        convertedToBuyerId: 'buyer-1',
        convertedToTenantId: null,
        convertedToSaleAgreementId: null,
      };
      const newProfile = {
        id: 'ip-new',
        convertedToBuyerId: null,
      };

      buyersRepository.findOne.mockResolvedValue({
        ...mockBuyer,
        interestedProfileId: 'ip-old',
      });
      interestedProfilesRepository.findOne
        .mockResolvedValueOnce(newProfile) // resolveNextInterestedProfile
        .mockResolvedValueOnce(prevProfile); // syncInterestedProfileLinks - prev
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await service.update(
        'buyer-1',
        { interestedProfileId: 'ip-new' } as any,
        'company-1',
      );

      expect(interestedProfilesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ip-old',
          convertedToBuyerId: null,
          status: InterestedStatus.INTERESTED,
        }),
      );
      expect(interestedProfilesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ip-new',
          convertedToBuyerId: 'buyer-1',
          status: InterestedStatus.BUYER,
        }),
      );
    });

    it('sets null interested profile and unlinks previous', async () => {
      const prevProfile = {
        id: 'ip-old',
        convertedToBuyerId: 'buyer-1',
        convertedToTenantId: 'tenant-1',
        convertedToSaleAgreementId: null,
      };

      buyersRepository.findOne.mockResolvedValue({
        ...mockBuyer,
        interestedProfileId: 'ip-old',
      });
      interestedProfilesRepository.findOne.mockResolvedValueOnce(prevProfile); // syncInterestedProfileLinks
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await service.update(
        'buyer-1',
        { interestedProfileId: null } as any,
        'company-1',
      );

      expect(interestedProfilesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ip-old',
          convertedToBuyerId: null,
          status: InterestedStatus.TENANT,
        }),
      );
    });

    it('throws ConflictException when interested profile linked to other buyer', async () => {
      buyersRepository.findOne.mockResolvedValue({ ...mockBuyer });
      interestedProfilesRepository.findOne.mockResolvedValue({
        id: 'ip-1',
        convertedToBuyerId: 'other-buyer',
      });

      await expect(
        service.update(
          'buyer-1',
          { interestedProfileId: 'ip-1' } as any,
          'company-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('resolveInterestedStatusWithoutBuyer returns BUYER when sale agreement exists', async () => {
      const prevProfile = {
        id: 'ip-old',
        convertedToBuyerId: 'buyer-1',
        convertedToTenantId: null,
        convertedToSaleAgreementId: 'sale-1',
      };

      buyersRepository.findOne.mockResolvedValue({
        ...mockBuyer,
        interestedProfileId: 'ip-old',
      });
      interestedProfilesRepository.findOne.mockResolvedValueOnce(prevProfile);
      usersRepository.findOne.mockResolvedValue(null);
      usersRepository.save.mockResolvedValue(mockBuyer.user);
      buyersRepository.save.mockResolvedValue(mockBuyer);

      await service.update(
        'buyer-1',
        { interestedProfileId: null } as any,
        'company-1',
      );

      expect(interestedProfilesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'ip-old',
          status: InterestedStatus.BUYER,
        }),
      );
    });
  });
});
