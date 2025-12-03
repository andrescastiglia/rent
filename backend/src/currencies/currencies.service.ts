import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';

@Injectable()
export class CurrenciesService {
  constructor(
    @InjectRepository(Currency)
    private currencyRepository: Repository<Currency>,
  ) {}

  async findAll(activeOnly: boolean = true): Promise<Currency[]> {
    const where = activeOnly ? { isActive: true } : {};
    return this.currencyRepository.find({
      where,
      order: { code: 'ASC' },
    });
  }

  async findOne(code: string): Promise<Currency> {
    const currency = await this.currencyRepository.findOne({
      where: { code: code.toUpperCase() },
    });
    if (!currency) {
      throw new NotFoundException(`Currency ${code} not found`);
    }
    return currency;
  }

  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    const currency = this.currencyRepository.create({
      ...createCurrencyDto,
      code: createCurrencyDto.code.toUpperCase(),
    });
    return this.currencyRepository.save(currency);
  }

  async update(
    code: string,
    updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    const currency = await this.findOne(code);
    Object.assign(currency, updateCurrencyDto);
    return this.currencyRepository.save(currency);
  }

  async remove(code: string): Promise<void> {
    const currency = await this.findOne(code);
    await this.currencyRepository.remove(currency);
  }

  async getDefaultForLocale(locale: string): Promise<Currency> {
    const localeDefaults: Record<string, string> = {
      es: 'ARS',
      pt: 'BRL',
      en: 'USD',
    };
    const currencyCode = localeDefaults[locale] || 'USD';
    return this.findOne(currencyCode);
  }
}
