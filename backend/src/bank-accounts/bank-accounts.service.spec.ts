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
    service = new BankAccountsService(
      bankAccountsRepository as any,
      ownersRepository as any,
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
