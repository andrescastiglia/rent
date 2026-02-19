import { UnitsController } from './units.controller';

describe('UnitsController', () => {
  const unitsService = {
    create: jest.fn(),
    findByProperty: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: UnitsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UnitsController(unitsService as any);
  });

  it('delegates create/find/update to service', async () => {
    unitsService.create.mockResolvedValue({ id: 'u1' });
    unitsService.findByProperty.mockResolvedValue([{ id: 'u1' }]);
    unitsService.findOne.mockResolvedValue({ id: 'u1' });
    unitsService.update.mockResolvedValue({ id: 'u1', floor: '2' });

    expect(await controller.create({ unitNumber: '101' } as any)).toEqual({
      id: 'u1',
    });
    expect(await controller.findByProperty('p1')).toEqual([{ id: 'u1' }]);
    expect(await controller.findOne('u1')).toEqual({ id: 'u1' });
    expect(await controller.update('u1', { floor: '2' } as any)).toEqual({
      id: 'u1',
      floor: '2',
    });
  });

  it('removes unit and returns static message', async () => {
    unitsService.remove.mockResolvedValue(undefined);

    await expect(controller.remove('u1')).resolves.toEqual({
      message: 'Unit deleted successfully',
    });
    expect(unitsService.remove).toHaveBeenCalledWith('u1');
  });
});
