import { BankAccountsController } from './bank-accounts.controller';
import { UserRole } from '../users/entities/user.entity';

describe('BankAccountsController', () => {
  const bankAccountsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: BankAccountsController;

  const req = {
    user: {
      id: 'u1',
      email: 'admin@test.dev',
      companyId: 'c1',
      role: UserRole.ADMIN,
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BankAccountsController(bankAccountsService as any);
  });

  it('delegates findAll to service', async () => {
    bankAccountsService.findAll.mockResolvedValue([{ id: 'ba1' }]);
    const result = await controller.findAll(req, undefined);
    expect(result).toEqual([{ id: 'ba1' }]);
    expect(bankAccountsService.findAll).toHaveBeenCalledWith(
      'c1',
      req.user,
      undefined,
    );
  });

  it('delegates findOne to service', async () => {
    bankAccountsService.findOne.mockResolvedValue({ id: 'ba1' });
    const result = await controller.findOne('ba1', req);
    expect(result).toEqual({ id: 'ba1' });
  });

  it('delegates create to service', async () => {
    bankAccountsService.create.mockResolvedValue({ id: 'ba1' });
    const result = await controller.create({ bankName: 'BN' } as any, req);
    expect(result).toEqual({ id: 'ba1' });
  });

  it('delegates update to service', async () => {
    bankAccountsService.update.mockResolvedValue({
      id: 'ba1',
      bankName: 'Updated',
    });
    const result = await controller.update(
      'ba1',
      { bankName: 'Updated' } as any,
      req,
    );
    expect(result).toEqual({ id: 'ba1', bankName: 'Updated' });
  });

  it('delegates remove to service', async () => {
    bankAccountsService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('ba1', req)).resolves.toBeUndefined();
    expect(bankAccountsService.remove).toHaveBeenCalledWith(
      'ba1',
      'c1',
      req.user,
    );
  });
});
