import { PropertyVisitsController } from './property-visits.controller';

describe('PropertyVisitsController', () => {
  const propertyVisitsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    createMaintenanceTask: jest.fn(),
  };

  let controller: PropertyVisitsController;

  const req = {
    user: {
      id: 'u1',
      role: 'admin',
      companyId: 'c1',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PropertyVisitsController(propertyVisitsService as any);
  });

  it('delegates create and list methods to service', async () => {
    propertyVisitsService.create.mockResolvedValue({ id: 'v1' });
    propertyVisitsService.findAll.mockResolvedValue([{ id: 'v1' }]);
    propertyVisitsService.createMaintenanceTask.mockResolvedValue({ id: 'm1' });

    expect(
      await controller.create('p1', { comments: 'ok' } as any, req),
    ).toEqual({
      id: 'v1',
    });
    expect(await controller.findAll('p1', req)).toEqual([{ id: 'v1' }]);
    expect(
      await controller.createMaintenanceTask(
        'p1',
        { taskTitle: 'Fix' } as any,
        req,
      ),
    ).toEqual({ id: 'm1' });
    expect(await controller.findAllMaintenanceTasks('p1', req)).toEqual([
      { id: 'v1' },
    ]);
  });
});
