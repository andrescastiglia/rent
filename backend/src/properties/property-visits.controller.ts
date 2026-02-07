import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PropertyVisitsService } from './property-visits.service';
import { CreatePropertyVisitDto } from './dto/create-property-visit.dto';
import { CreatePropertyMaintenanceTaskDto } from './dto/create-property-maintenance-task.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    role: string;
    companyId?: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('properties/:propertyId/visits')
export class PropertyVisitsController {
  constructor(private readonly propertyVisitsService: PropertyVisitsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreatePropertyVisitDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertyVisitsService.create(propertyId, dto, req.user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findAll(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertyVisitsService.findAll(propertyId, req.user);
  }

  @Post('/maintenance-tasks')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  createMaintenanceTask(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreatePropertyMaintenanceTaskDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertyVisitsService.createMaintenanceTask(
      propertyId,
      dto,
      req.user,
    );
  }

  @Get('/maintenance-tasks')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findAllMaintenanceTasks(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.propertyVisitsService.findAll(propertyId, req.user);
  }
}
