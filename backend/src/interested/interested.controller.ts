import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { InterestedService } from './interested.service';
import { CreateInterestedProfileDto } from './dto/create-interested-profile.dto';
import { UpdateInterestedProfileDto } from './dto/update-interested-profile.dto';
import { InterestedFiltersDto } from './dto/interested-filters.dto';
import { ChangeInterestedStageDto } from './dto/change-interested-stage.dto';
import { CreateInterestedActivityDto } from './dto/create-interested-activity.dto';
import { UpdateInterestedActivityDto } from './dto/update-interested-activity.dto';
import { UpdateInterestedMatchDto } from './dto/update-interested-match.dto';
import { ConvertInterestedToTenantDto } from './dto/convert-interested-to-tenant.dto';
import { ConvertInterestedToBuyerDto } from './dto/convert-interested-to-buyer.dto';
import { CreatePropertyReservationDto } from './dto/create-property-reservation.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    role: string;
    companyId?: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('interested')
export class InterestedController {
  constructor(private readonly interestedService: InterestedService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  create(
    @Body() dto: CreateInterestedProfileDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.create(dto, req.user);
  }

  @Get('metrics/overview')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  getMetrics(@Request() req: AuthenticatedRequest): Promise<unknown> {
    return this.interestedService.getMetrics(req.user);
  }

  @Get('duplicates')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findPotentialDuplicates(@Request() req: AuthenticatedRequest) {
    return this.interestedService.findPotentialDuplicates(req.user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findAll(
    @Query() filters: InterestedFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.findAll(filters, req.user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.findOne(id, req.user);
  }

  @Get(':id/summary')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  getSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.getSummary(id, req.user);
  }

  @Get(':id/timeline')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.interestedService.getTimeline(id, req.user);
  }

  @Get(':id/matches')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findMatches(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.listMatches(id, req.user);
  }

  @Post(':id/matches/refresh')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  refreshMatches(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.refreshMatches(id, req.user);
  }

  @Patch(':id/matches/:matchId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  updateMatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() dto: UpdateInterestedMatchDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.updateMatch(id, matchId, dto, req.user);
  }

  @Post(':id/stage')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  changeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeInterestedStageDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.changeStage(id, dto, req.user);
  }

  @Post(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInterestedActivityDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.createActivity(id, dto, req.user);
  }

  @Post(':id/reservations')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createReservation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePropertyReservationDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.createReservation(id, dto, req.user);
  }

  @Get(':id/reservations')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listReservations(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.listReservations(id, req.user);
  }

  @Patch(':id/activities/:activityId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  updateActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateInterestedActivityDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.updateActivity(id, activityId, dto, req.user);
  }

  @Post(':id/convert/tenant')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  convertToTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertInterestedToTenantDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.convertToTenant(id, dto, req.user);
  }

  @Post(':id/convert/buyer')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  convertToBuyer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertInterestedToBuyerDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.convertToBuyer(id, dto, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterestedProfileDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.interestedService.remove(id, req.user);
    return { message: 'Interested profile deleted successfully' };
  }
}
