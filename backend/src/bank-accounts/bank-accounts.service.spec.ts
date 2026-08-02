import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';
import { BankAccountsService } from './bank-accounts.service';

describe('BankAccountsService', () => {
  const bankAccountsRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  const ownersRepository = {
    findOne: jest.fn(),
  };
  const propertiesRepository = {
    findOne: jest.fn(),
  };
  const usersRepository = {
    findOne: jest.fn(),
  };

  let service: BankAccountsService;

  const adminUser = {
    id: 'u1',
    companyId: 'c1',
    role: UserRole.ADMIN,
  };
  const ownerUser = {
    id: 'u2',
    companyId: 'c1',
    role: UserRole.OWNER,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    usersRepository.findOne.mockResolvedValue({ id: 'u1', companyId: 'c1' });
    service = new BankAccountsService(
      bankAccountsRepository as any,
      ownersRepository as any,
      propertiesRepository as any,
      usersRepository as any,
    );
  });

  describe('findAll', () => {
    it('returns accounts for admin without owner filter', async () => {
      bankAccountsRepository.find.mockResolvedValue([{ id: 'ba1' }]);
      const result = await service.findAll('c1', adminUser);
      expect(result).toEqual([{ id: 'ba1' }]);
      expect(bankAccountsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'c1' }),
        }),
      );
    });

    it('filters by ownerId param when role is not OWNER', async () => {
      bankAccountsRepository.find.mockResolvedValue([{ id: 'ba1' }]);
      await service.findAll('c1', adminUser, 'o99');
      expect(bankAccountsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'o99' }),
        }),
      );
    });

    it('scopes to owner record when role=OWNER', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      bankAccountsRepository.find.mockResolvedValue([{ id: 'ba2' }]);
      const result = await service.findAll('c1', ownerUser);
      expect(result).toEqual([{ id: 'ba2' }]);
      expect(bankAccountsRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'o1' }),
        }),
      );
    });

    it('returns empty array when owner user has no owner record', async () => {
      ownersRepository.findOne.mockResolvedValue(null);
      const result = await service.findAll('c1', ownerUser);
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('returns bank account when found', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({ id: 'ba1' });
      const result = await service.findOne('ba1', 'c1');
      expect(result).toEqual({ id: 'ba1' });
    });

    it('throws NotFoundException when not found', async () => {
      bankAccountsRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('ba1', 'c1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows OWNER to access their own bank account', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({
        id: 'ba1',
        ownerId: 'o1',
      });
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      const result = await service.findOne('ba1', 'c1', ownerUser);
      expect(result).toEqual({ id: 'ba1', ownerId: 'o1' });
    });

    it('throws ForbiddenException when OWNER tries to access another owner account', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({
        id: 'ba1',
        ownerId: 'other-owner',
      });
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      await expect(service.findOne('ba1', 'c1', ownerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when OWNER has no owner record', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({
        id: 'ba1',
        ownerId: 'o1',
      });
      ownersRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('ba1', 'c1', ownerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('create', () => {
    it('creates and saves a bank account', async () => {
      const dto = {
        bankName: 'Banco Nacion',
        accountType: 'checking',
        accountNumber: '123',
        userId: 'u1',
      };
      bankAccountsRepository.create.mockReturnValue({ id: 'ba1', ...dto });
      bankAccountsRepository.save.mockResolvedValue({ id: 'ba1', ...dto });
      const result = await service.create(dto as any, 'c1');
      expect(result.id).toBe('ba1');
    });

    it('creates with isDefault clears other defaults', async () => {
      const dto = { bankName: 'B', accountNumber: '1', isDefault: true };
      bankAccountsRepository.update.mockResolvedValue({});
      bankAccountsRepository.create.mockReturnValue({ id: 'ba2', ...dto });
      bankAccountsRepository.save.mockResolvedValue({ id: 'ba2', ...dto });
      await service.create(dto as any, 'c1');
      expect(bankAccountsRepository.update).toHaveBeenCalled();
    });

    it('creates for OWNER using resolved owner id', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      usersRepository.findOne.mockResolvedValue({ id: 'u2', companyId: 'c1' });
      const dto = { bankName: 'B', accountNumber: '1' };
      bankAccountsRepository.create.mockReturnValue({
        id: 'ba3',
        ownerId: 'o1',
      });
      bankAccountsRepository.save.mockResolvedValue({
        id: 'ba3',
        ownerId: 'o1',
      });
      const result = await service.create(dto as any, 'c1', ownerUser);
      expect(result.ownerId).toBe('o1');
      expect(bankAccountsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u2', ownerId: 'o1' }),
      );
    });

    it('throws ForbiddenException when OWNER has no owner profile on create', async () => {
      ownersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create({ bankName: 'B' } as any, 'c1', ownerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a virtual alias associated with a company property', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      propertiesRepository.findOne.mockResolvedValue({
        id: 'p1',
        companyId: 'c1',
        ownerId: 'o1',
      });
      const dto = {
        bankName: 'Virtual Bank',
        accountType: 'virtual',
        accountNumber: 'VA-1',
        ownerId: 'o1',
        propertyId: 'p1',
        alias: 'rent.unit.1',
        isVirtualAlias: true,
      };
      bankAccountsRepository.create.mockReturnValue({ id: 'ba4', ...dto });
      bankAccountsRepository.save.mockResolvedValue({ id: 'ba4', ...dto });

      await expect(
        service.create(dto as any, 'c1', adminUser),
      ).resolves.toEqual(
        expect.objectContaining({ alias: 'rent.unit.1', propertyId: 'p1' }),
      );
    });

    it('rejects virtual aliases without a property and alias', async () => {
      await expect(
        service.create(
          {
            bankName: 'Virtual Bank',
            accountType: 'virtual',
            accountNumber: 'VA-1',
            isVirtualAlias: true,
          } as any,
          'c1',
          adminUser,
        ),
      ).rejects.toThrow('Virtual bank accounts require propertyId and alias');
    });

    it('rejects a referenced user from another company', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create(
          {
            bankName: 'Bank',
            accountType: 'checking',
            accountNumber: '1',
            userId: 'foreign-user',
          } as any,
          'c1',
          adminUser,
        ),
      ).rejects.toThrow('Bank account user must belong to company');
    });

    it('rejects an owner from another company', async () => {
      ownersRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create(
          {
            bankName: 'Bank',
            accountType: 'checking',
            accountNumber: '1',
            ownerId: 'foreign-owner',
          } as any,
          'c1',
          adminUser,
        ),
      ).rejects.toThrow('Bank account owner must belong to company');
    });

    it('rejects a virtual alias property from another company', async () => {
      propertiesRepository.findOne.mockResolvedValue(null);
      await expect(
        service.create(
          {
            bankName: 'Virtual Bank',
            accountType: 'virtual',
            accountNumber: 'VA-1',
            propertyId: 'foreign-property',
            alias: 'rent.foreign',
            isVirtualAlias: true,
          } as any,
          'c1',
          adminUser,
        ),
      ).rejects.toThrow('Virtual alias property must belong to company');
    });

    it('prevents owners from assigning aliases to another owner property', async () => {
      ownersRepository.findOne.mockResolvedValue({ id: 'o1' });
      usersRepository.findOne.mockResolvedValue({ id: 'u2', companyId: 'c1' });
      propertiesRepository.findOne.mockResolvedValue({
        id: 'p2',
        companyId: 'c1',
        ownerId: 'other-owner',
      });
      await expect(
        service.create(
          {
            bankName: 'Virtual Bank',
            accountType: 'virtual',
            accountNumber: 'VA-2',
            propertyId: 'p2',
            alias: 'rent.other',
            isVirtualAlias: true,
          } as any,
          'c1',
          ownerUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates and saves a bank account', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({
        id: 'ba1',
        bankName: 'Old',
      });
      bankAccountsRepository.update.mockResolvedValue({});
      bankAccountsRepository.save.mockResolvedValue({
        id: 'ba1',
        bankName: 'New',
      });
      const result = await service.update(
        'ba1',
        { bankName: 'New' } as any,
        'c1',
      );
      expect(result.bankName).toBe('New');
    });

    it('clears other defaults when isDefault is true on update', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({
        id: 'ba1',
        ownerId: 'o1',
      });
      bankAccountsRepository.update.mockResolvedValue({});
      bankAccountsRepository.save.mockResolvedValue({
        id: 'ba1',
        isDefault: true,
      });
      await service.update('ba1', { isDefault: true } as any, 'c1');
      expect(bankAccountsRepository.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft deletes when admin', async () => {
      bankAccountsRepository.findOne.mockResolvedValue({ id: 'ba1' });
      bankAccountsRepository.softDelete.mockResolvedValue({});
      await expect(
        service.remove('ba1', 'c1', adminUser),
      ).resolves.toBeUndefined();
      expect(bankAccountsRepository.softDelete).toHaveBeenCalledWith('ba1');
    });

    it('throws ForbiddenException when not admin', async () => {
      await expect(service.remove('ba1', 'c1', ownerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
