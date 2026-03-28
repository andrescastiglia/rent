import { BuyersController } from './buyers.controller';

describe('BuyersController', () => {
  const buyersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  let controller: BuyersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new BuyersController(buyersService as any);
  });

  it('findAll delegates to service with query and companyId', async () => {
    const data = [{ id: 'b1' }];
    buyersService.findAll.mockResolvedValue({ data, total: 1 });

    const result = await controller.findAll(
      { page: 1, limit: 10 } as any,
      { user: { id: 'u1', companyId: 'co1', role: 'admin' } } as any,
    );

    expect(buyersService.findAll).toHaveBeenCalledWith(
      { page: 1, limit: 10 },
      'co1',
    );
    expect(result).toEqual({ data, total: 1 });
  });

  it('findOne delegates to service with id and companyId', async () => {
    buyersService.findOne.mockResolvedValue({ id: 'b1' });

    const result = await controller.findOne('b1', {
      user: { id: 'u1', companyId: 'co1', role: 'admin' },
    } as any);

    expect(buyersService.findOne).toHaveBeenCalledWith('b1', 'co1');
    expect(result).toEqual({ id: 'b1' });
  });

  it('findOne scopes buyer requests to the authenticated user', async () => {
    buyersService.findOne.mockResolvedValue({ id: 'b1' });

    const result = await controller.findOne('b1', {
      user: { id: 'u1', companyId: 'co1', role: 'buyer' },
    } as any);

    expect(buyersService.findOne).toHaveBeenCalledWith('b1', 'co1', 'u1');
    expect(result).toEqual({ id: 'b1' });
  });

  it('create delegates to service with dto and companyId', async () => {
    buyersService.create.mockResolvedValue({ id: 'b1' });

    const result = await controller.create(
      { name: 'Test' } as any,
      {
        user: { id: 'u1', companyId: 'co1', role: 'admin' },
      } as any,
    );

    expect(buyersService.create).toHaveBeenCalledWith({ name: 'Test' }, 'co1');
    expect(result).toEqual({ id: 'b1' });
  });

  it('update delegates to service with id, dto, and companyId', async () => {
    buyersService.update.mockResolvedValue({ id: 'b1', name: 'Updated' });

    const result = await controller.update(
      'b1',
      { name: 'Updated' } as any,
      {
        user: { id: 'u1', companyId: 'co1', role: 'admin' },
      } as any,
    );

    expect(buyersService.update).toHaveBeenCalledWith(
      'b1',
      { name: 'Updated' },
      'co1',
    );
    expect(result).toEqual({ id: 'b1', name: 'Updated' });
  });
});
