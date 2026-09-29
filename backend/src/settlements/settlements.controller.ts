import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SettlementsService } from './settlements.service';
import {
  SettlementFiltersDto,
  SettlementSummaryFiltersDto,
} from './dto/settlement-filters.dto';
import { SettlementSummaryDto } from './dto/settlement-summary.dto';
import { ApiOkResponse } from '@nestjs/swagger';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
  };
}

@Controller('settlements')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
@Authenticated('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: SettlementFiltersDto,
  ) {
    return this.settlementsService.findAll(
      req.user.companyId,
      filters,
      req.user,
    );
  }

  @Get('summary')
  @ApiOkResponse({ type: SettlementSummaryDto })
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async getSummary(
    @Request() req: AuthenticatedRequest,
    @Query() filters: SettlementSummaryFiltersDto,
  ) {
    return this.settlementsService.getSummary(
      req.user.companyId,
      req.user,
      filters,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.findOne(id, req.user.companyId, req.user);
  }
}
