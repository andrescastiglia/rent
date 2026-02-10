import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { OwnersService } from './owners.service';
import { Owner } from './entities/owner.entity';
import { OwnerActivity } from './entities/owner-activity.entity';
import { CreateOwnerActivityDto } from './dto/create-owner-activity.dto';
import { UpdateOwnerActivityDto } from './dto/update-owner-activity.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: string;
  };
}

@Controller('owners')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  /**
   * Get all owners for the authenticated user's company.
   */
  @Get()
  async findAll(@Request() req: AuthenticatedRequest): Promise<Owner[]> {
    return this.ownersService.findAll(req.user.companyId);
  }

  @Post()
  async create(
    @Body() dto: CreateOwnerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.create(dto, req.user.companyId);
  }

  /**
   * Get owner by ID.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.update(id, dto, req.user.companyId);
  }

  @Get(':id/activities')
  async listActivities(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity[]> {
    return this.ownersService.listActivities(id, req.user.companyId);
  }

  @Post(':id/activities')
  async createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity> {
    return this.ownersService.createActivity(id, dto, {
      id: req.user.id,
      companyId: req.user.companyId,
    });
  }

  @Patch(':id/activities/:activityId')
  async updateActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity> {
    return this.ownersService.updateActivity(
      id,
      activityId,
      dto,
      req.user.companyId,
    );
  }
}
