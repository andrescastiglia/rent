import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { SelfServiceAction } from '../common/decorators/self-service-action.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceTicket } from './entities/maintenance-ticket.entity';
import { MaintenanceTicketComment } from './entities/maintenance-ticket-comment.entity';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { MaintenanceTicketFiltersDto } from './dto/maintenance-ticket-filters.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { isAdminOrStaff } from '../common/helpers/role-scope.helper';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
  };
}

@Controller('maintenance/tickets')
@UseGuards(JwtAuthGuard)
@Authenticated('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: MaintenanceTicketFiltersDto,
  ): Promise<MaintenanceTicket[]> {
    return this.maintenanceService.findAll(req.user, filters);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.findOne(id, req.user);
  }

  @Post()
  @SelfServiceAction('maintenance.request')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.OWNER)
  async create(
    @Body() dto: CreateMaintenanceTicketDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.create(req.user, dto, executionKey);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceTicketDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.update(id, req.user, dto, executionKey);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<void> {
    return this.maintenanceService.remove(id, req.user, executionKey);
  }

  @Get(':id/comments')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicketComment[]> {
    const canSeeInternalComments = isAdminOrStaff(req.user);
    return this.maintenanceService.getComments(
      id,
      req.user,
      canSeeInternalComments,
    );
  }

  @Post(':id/comments')
  @SelfServiceAction('maintenance.comment')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.TENANT, UserRole.OWNER)
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<MaintenanceTicketComment> {
    const canCreateInternalComment = isAdminOrStaff(req.user);
    const safeDto = {
      ...dto,
      isInternal: canCreateInternalComment ? dto.isInternal : false,
    };
    return this.maintenanceService.addComment(
      id,
      req.user,
      safeDto,
      executionKey,
    );
  }
}
