import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Currency } from './entities/currency.entity';
import { CurrenciesService } from './currencies.service';

describe('CurrenciesService', () => {
  let service: CurrenciesService;

  const currencyRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrenciesService,
        {
          provide: getRepositoryToken(Currency),
          useValue: currencyRepository,
        },
      ],
    }).compile();

    service = module.get<CurrenciesService>(CurrenciesService);
  });

  it('findAll uses active filter by default and sorts by code', async () => {
    currencyRepository.find.mockResolvedValue([{ code: 'ARS' }]);

    const result = await service.findAll();
    expect(currencyRepository.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { code: 'ASC' },
    });
    expect(result).toEqual([{ code: 'ARS' }]);
  });

  it('findAll can include inactive currencies', async () => {
    currencyRepository.find.mockResolvedValue([{ code: 'USD' }]);
    await service.findAll(false);
    expect(currencyRepository.find).toHaveBeenCalledWith({
      where: {},
      order: { code: 'ASC' },
    });
  });

  it('findOne normalizes code and throws when not found', async () => {
    currencyRepository.findOne.mockResolvedValueOnce({ code: 'USD' });
    await expect(service.findOne('usd')).resolves.toEqual({ code: 'USD' });
    expect(currencyRepository.findOne).toHaveBeenCalledWith({
      where: { code: 'USD' },
    });

    currencyRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('eur')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create uppercases code and saves entity', async () => {
    currencyRepository.create.mockReturnValue({ id: '1', code: 'ARS' });
    currencyRepository.save.mockResolvedValue({ id: '1', code: 'ARS' });
    const result = await service.create({
      code: 'ars',
      symbol: '$',
      name: 'Peso',
    } as any);

    expect(currencyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ARS' }),
    );
    expect(result).toEqual({ id: '1', code: 'ARS' });
  });

  it('update merges fields into existing currency and saves', async () => {
    const current = { code: 'USD', name: 'US Dollar' } as any;
    jest.spyOn(service, 'findOne').mockResolvedValue(current);
    currencyRepository.save.mockResolvedValue({
      code: 'USD',
      name: 'Dolar',
      symbol: '$',
    });

    const result = await service.update('usd', {
      name: 'Dolar',
      symbol: '$',
    } as any);

    expect(result).toEqual({ code: 'USD', name: 'Dolar', symbol: '$' });
  });

  it('remove deletes resolved currency', async () => {
    const existing = { code: 'BRL' } as any;
    jest.spyOn(service, 'findOne').mockResolvedValue(existing);
    await service.remove('brl');
    expect(currencyRepository.remove).toHaveBeenCalledWith(existing);
  });

  it('getDefaultForLocale maps known locales and falls back to USD', async () => {
    const findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({
      code: 'ARS',
    } as any);

    await service.getDefaultForLocale('es');
    expect(findOneSpy).toHaveBeenLastCalledWith('ARS');

    await service.getDefaultForLocale('pt');
    expect(findOneSpy).toHaveBeenLastCalledWith('BRL');

    await service.getDefaultForLocale('en');
    expect(findOneSpy).toHaveBeenLastCalledWith('USD');

    await service.getDefaultForLocale('de');
    expect(findOneSpy).toHaveBeenLastCalledWith('USD');
  });
});
