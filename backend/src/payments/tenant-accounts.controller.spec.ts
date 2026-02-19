import { TenantAccountsController } from './tenant-accounts.controller';

describe('TenantAccountsController', () => {
  const tenantAccountsService = {
    findByLease: jest.fn(),
    findOne: jest.fn(),
    getMovements: jest.fn(),
    getBalanceInfo: jest.fn(),
  };
  let controller: TenantAccountsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantAccountsController(tenantAccountsService as any);
  });

  it('delegates account retrieval endpoints', async () => {
    tenantAccountsService.findByLease.mockResolvedValue({ id: 'acc-1' });
    tenantAccountsService.findOne.mockResolvedValue({ id: 'acc-1' });
    tenantAccountsService.getMovements.mockResolvedValue([]);
    tenantAccountsService.getBalanceInfo.mockResolvedValue({
      balance: 100,
      lateFee: 0,
    });

    await expect(controller.findByLease('lease-1')).resolves.toEqual({
      id: 'acc-1',
    });
    await expect(controller.findOne('acc-1')).resolves.toEqual({ id: 'acc-1' });
    await expect(controller.getMovements('acc-1')).resolves.toEqual([]);
    await expect(controller.getBalance('acc-1')).resolves.toEqual({
      balance: 100,
      lateFee: 0,
    });
  });
});
