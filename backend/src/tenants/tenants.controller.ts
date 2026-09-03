import {
  ParseUUIDPipe,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantFiltersDto } from './dto/tenant-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateTenantActivityDto } from './dto/create-tenant-activity.dto';
import { UpdateTenantActivityDto } from './dto/update-tenant-activity.dto';
import { TenantActivity } from './entities/tenant-activity.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
  };
}

@Controller('tenants')
@UseGuards(AuthGuard('jwt'))
@Authenticated('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(
    @Body() createTenantDto: CreateTenantDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tenantsService.create(createTenantDto, req.user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER)
  findAll(
    @Query() filters: TenantFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tenantsService.findAll(filters, req.user);
  }

  @Get('me')
  @Roles(UserRole.TENANT)
  getMyProfile(@Request() req: AuthenticatedRequest) {
    return this.tenantsService.findByUserId(req.user.id, req.user.companyId);
  }

  @Get('me/summary')
  @Roles(UserRole.TENANT)
  getMyProfileSummary(@Request() req: AuthenticatedRequest) {
    return this.tenantsService.getTenantSummary(
      req.user.id,
      req.user.companyId,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER)
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.tenantsService.findOne(id, req.user);
  }

  @Get(':id/leases')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER)
  getLeaseHistory(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tenantsService.getLeaseHistory(id, req.user);
  }

  @Get(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listActivities(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TenantActivity[]> {
    return this.tenantsService.listActivities(id, req.user);
  }

  @Post(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTenantActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<TenantActivity> {
    return this.tenantsService.createActivity(id, dto, {
      id: req.user.id,
      companyId: req.user.companyId,
      role: req.user.role,
      roles: req.user.roles,
    });
  }

  @Patch(':id/activities/:activityId')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  updateActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateTenantActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<TenantActivity> {
    return this.tenantsService.updateActivity(id, activityId, dto, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tenantsService.update(id, updateTenantDto, req.user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    await this.tenantsService.remove(id, req.user);
    return { message: 'Tenant deleted successfully' };
  }
}
