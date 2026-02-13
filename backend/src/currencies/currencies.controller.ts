import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto/currency.dto';
import { CurrencyFiltersDto } from './dto/currency-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  @Get()
  findAll(@Query() query: CurrencyFiltersDto) {
    return this.currenciesService.findAll(query.activeOnly !== false);
  }

  @Get('default/:locale')
  getDefaultForLocale(@Param('locale') locale: string) {
    return this.currenciesService.getDefaultForLocale(locale);
  }

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.currenciesService.findOne(code);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createCurrencyDto: CreateCurrencyDto) {
    return this.currenciesService.create(createCurrencyDto);
  }

  @Put(':code')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('code') code: string,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(code, updateCurrencyDto);
  }

  @Delete(':code')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('code') code: string) {
    return this.currenciesService.remove(code);
  }
}
