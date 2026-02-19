import { TenantsController } from './tenants.controller';

describe('TenantsController', () => {
  const tenantsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getLeaseHistory: jest.fn(),
    listActivities: jest.fn(),
    createActivity: jest.fn(),
    updateActivity: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: TenantsController;
  const req = { user: { id: 'u1', companyId: 'c1' } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TenantsController(tenantsService as any);
  });

  it('delegates tenant CRUD and related endpoints', async () => {
    tenantsService.create.mockResolvedValue({ id: 't1' });
    tenantsService.findAll.mockResolvedValue({ data: [] });
    tenantsService.findOne.mockResolvedValue({ id: 't1' });
    tenantsService.getLeaseHistory.mockResolvedValue([]);
    tenantsService.listActivities.mockResolvedValue([]);
    tenantsService.createActivity.mockResolvedValue({ id: 'a1' });
    tenantsService.updateActivity.mockResolvedValue({ id: 'a1' });
    tenantsService.update.mockResolvedValue({ id: 't1', firstName: 'A' });

    await expect(controller.create({} as any)).resolves.toEqual({ id: 't1' });
    await expect(controller.findAll({} as any)).resolves.toEqual({ data: [] });
    await expect(controller.findOne('t1')).resolves.toEqual({ id: 't1' });
    await expect(controller.getLeaseHistory('t1')).resolves.toEqual([]);
    await expect(controller.listActivities('t1', req)).resolves.toEqual([]);
    await expect(
      controller.createActivity('t1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
    await expect(
      controller.updateActivity('t1', 'a1', {} as any, req),
    ).resolves.toEqual({ id: 'a1' });
    await expect(controller.update('t1', {} as any)).resolves.toEqual({
      id: 't1',
      firstName: 'A',
    });
  });

  it('remove returns success message', async () => {
    tenantsService.remove.mockResolvedValue(undefined);
    await expect(controller.remove('t1')).resolves.toEqual({
      message: 'Tenant deleted successfully',
    });
  });
});
