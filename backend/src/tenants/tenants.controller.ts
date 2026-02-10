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
import { UserRole } from '../users/entities/user.entity';
import { CreateTenantActivityDto } from './dto/create-tenant-activity.dto';
import { UpdateTenantActivityDto } from './dto/update-tenant-activity.dto';
import { TenantActivity } from './entities/tenant-activity.entity';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
  };
}

@Controller('tenants')
@UseGuards(AuthGuard('jwt'))
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  findAll(@Query() filters: TenantFiltersDto) {
    return this.tenantsService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Get(':id/leases')
  getLeaseHistory(@Param('id') id: string) {
    return this.tenantsService.getLeaseHistory(id);
  }

  @Get(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  listActivities(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<TenantActivity[]> {
    return this.tenantsService.listActivities(id, req.user.companyId);
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
    return this.tenantsService.updateActivity(
      id,
      activityId,
      dto,
      req.user.companyId,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string) {
    await this.tenantsService.remove(id);
    return { message: 'Tenant deleted successfully' };
  }
}
