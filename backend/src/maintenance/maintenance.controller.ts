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
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceTicket } from './entities/maintenance-ticket.entity';
import { MaintenanceTicketComment } from './entities/maintenance-ticket-comment.entity';
import { CreateMaintenanceTicketDto } from './dto/create-maintenance-ticket.dto';
import { UpdateMaintenanceTicketDto } from './dto/update-maintenance-ticket.dto';
import { MaintenanceTicketFiltersDto } from './dto/maintenance-ticket-filters.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('maintenance/tickets')
@UseGuards(JwtAuthGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: MaintenanceTicketFiltersDto,
  ): Promise<MaintenanceTicket[]> {
    return this.maintenanceService.findAll(req.user.companyId, filters);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.findOne(id, req.user.companyId);
  }

  @Post()
  async create(
    @Body() dto: CreateMaintenanceTicketDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.create(
      req.user.companyId,
      req.user.id,
      dto,
    );
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaintenanceTicketDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicket> {
    return this.maintenanceService.update(id, req.user.companyId, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.maintenanceService.remove(id, req.user.companyId);
  }

  @Get(':id/comments')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicketComment[]> {
    const isAdminOrStaff =
      req.user.role === UserRole.ADMIN || req.user.role === UserRole.STAFF;
    return this.maintenanceService.getComments(
      id,
      req.user.companyId,
      isAdminOrStaff,
    );
  }

  @Post(':id/comments')
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<MaintenanceTicketComment> {
    return this.maintenanceService.addComment(
      id,
      req.user.companyId,
      req.user.id,
      dto,
    );
  }
}
