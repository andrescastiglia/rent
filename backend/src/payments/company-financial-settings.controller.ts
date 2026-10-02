import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOkResponse } from '@nestjs/swagger';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CompanyFinancialSettingsService } from './company-financial-settings.service';
import {
  CompanyFinancialSettingsDto,
  CompanyFinancialSettingsViewDto,
} from './dto/company-financial-settings.dto';

@Controller('companies/current/financial-settings')
@UseGuards(AuthGuard('jwt'))
@Authenticated('payments')
@Roles(UserRole.ADMIN)
export class CompanyFinancialSettingsController {
  constructor(private readonly settings: CompanyFinancialSettingsService) {}
  @Get()
  @ApiOkResponse({ type: CompanyFinancialSettingsViewDto })
  get(@Request() req: { user: { companyId: string } }) {
    return this.settings.get(req.user.companyId);
  }

  @Patch()
  @ApiOkResponse({ type: CompanyFinancialSettingsViewDto })
  update(
    @Body() dto: CompanyFinancialSettingsDto,
    @Request() req: { user: { companyId: string; id: string } },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.settings.update(req.user.companyId, req.user.id, dto, key);
  }
}
