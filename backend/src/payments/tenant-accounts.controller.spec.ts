import { TenantAccountsController } from './tenant-accounts.controller';

describe('TenantAccountsController', () => {
  const tenantAccountsService = {
    findByLeaseScoped: jest.fn(),
    findOneScoped: jest.fn(),
    getMovementsScoped: jest.fn(),
    getBalanceInfoScoped: jest.fn(),
  };
  let controller: TenantAccountsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantAccountsController(tenantAccountsService as any);
  });

  it('delegates account retrieval endpoints', async () => {
    const request = {
      user: { id: 'admin-1', companyId: 'company-a', role: 'admin' },
    } as any;
    tenantAccountsService.findByLeaseScoped.mockResolvedValue({ id: 'acc-1' });
    tenantAccountsService.findOneScoped.mockResolvedValue({ id: 'acc-1' });
    tenantAccountsService.getMovementsScoped.mockResolvedValue([]);
    tenantAccountsService.getBalanceInfoScoped.mockResolvedValue({
      balance: 100,
      lateFee: 0,
    });

    await expect(controller.findByLease('lease-1', request)).resolves.toEqual({
      id: 'acc-1',
    });
    await expect(controller.findOne('acc-1', request)).resolves.toEqual({
      id: 'acc-1',
    });
    await expect(controller.getMovements('acc-1', request)).resolves.toEqual(
      [],
    );
    await expect(controller.getBalance('acc-1', request)).resolves.toEqual({
      balance: 100,
      lateFee: 0,
    });
    expect(tenantAccountsService.findByLeaseScoped).toHaveBeenCalledWith(
      'lease-1',
      request.user,
    );
    expect(tenantAccountsService.findOneScoped).toHaveBeenCalledWith(
      'acc-1',
      request.user,
    );
  });
});
