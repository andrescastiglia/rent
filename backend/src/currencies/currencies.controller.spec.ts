import { CurrenciesController } from './currencies.controller';

describe('CurrenciesController', () => {
  const currenciesService = {
    findAll: jest.fn(),
    getDefaultForLocale: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: CurrenciesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CurrenciesController(currenciesService as any);
  });

  it('findAll defaults to activeOnly=true', async () => {
    currenciesService.findAll.mockResolvedValue([{ code: 'ARS' }]);
    await expect(controller.findAll({} as any)).resolves.toEqual([
      { code: 'ARS' },
    ]);
    expect(currenciesService.findAll).toHaveBeenCalledWith(true);
  });

  it('findAll forwards activeOnly=false', async () => {
    currenciesService.findAll.mockResolvedValue([{ code: 'USD' }]);
    await controller.findAll({ activeOnly: false } as any);
    expect(currenciesService.findAll).toHaveBeenCalledWith(false);
  });

  it('delegates getDefaultForLocale and findOne', async () => {
    currenciesService.getDefaultForLocale.mockResolvedValue({ code: 'USD' });
    currenciesService.findOne.mockResolvedValue({ code: 'ARS' });

    await expect(controller.getDefaultForLocale('en')).resolves.toEqual({
      code: 'USD',
    });
    await expect(controller.findOne('ars')).resolves.toEqual({ code: 'ARS' });
  });

  it('delegates create update and remove', async () => {
    currenciesService.create.mockResolvedValue({ code: 'CLP' });
    currenciesService.update.mockResolvedValue({ code: 'CLP', symbol: '$' });
    currenciesService.remove.mockResolvedValue(undefined);

    await expect(
      controller.create({ code: 'clp', symbol: '$' } as any),
    ).resolves.toEqual({ code: 'CLP' });
    await expect(
      controller.update('clp', { symbol: '$' } as any),
    ).resolves.toEqual({ code: 'CLP', symbol: '$' });
    await expect(controller.remove('clp')).resolves.toBeUndefined();
  });
});
