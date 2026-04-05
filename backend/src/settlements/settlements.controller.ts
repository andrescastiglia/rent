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
import { UserRole } from '../users/entities/user.entity';
import { SettlementsService } from './settlements.service';
import { SettlementFiltersDto } from './dto/settlement-filters.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('settlements')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
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
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async getSummary(
    @Request() req: AuthenticatedRequest,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.settlementsService.getSummary(
      req.user.companyId,
      req.user,
      ownerId,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.settlementsService.findOne(id, req.user.companyId);
  }
}
