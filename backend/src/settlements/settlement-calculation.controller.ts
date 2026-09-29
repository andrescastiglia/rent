import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import {
  SettlementCalculationDto,
  SettlementCalculationQueryDto,
} from './dto/settlement-calculation.dto';
import { SettlementCalculationService } from './settlement-calculation.service';

@Controller('settlements/calculation')
@Roles(UserRole.ADMIN)
export class SettlementCalculationController {
  constructor(private readonly calculation: SettlementCalculationService) {}

  @Get('preview')
  @ApiOkResponse({ type: SettlementCalculationDto })
  preview(
    @Request() req: { user: { companyId: string } },
    @Query() query: SettlementCalculationQueryDto,
  ) {
    return this.calculation.preview(req.user.companyId, query);
  }
}
