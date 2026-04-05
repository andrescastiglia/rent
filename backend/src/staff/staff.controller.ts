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
import { StaffService } from './staff.service';
import { Staff } from './entities/staff.entity';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffFiltersDto } from './dto/staff-filters.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    phone?: string;
  };
}

@Controller('staff')
@UseGuards(JwtAuthGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query() filters: StaffFiltersDto,
  ): Promise<Staff[]> {
    return this.staffService.findAll(req.user.companyId, filters);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Staff> {
    return this.staffService.findOne(id, req.user.companyId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async create(
    @Body() dto: CreateStaffDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Staff> {
    return this.staffService.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Staff> {
    return this.staffService.update(id, dto, req.user.companyId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.staffService.remove(id, req.user.companyId);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN)
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Staff> {
    return this.staffService.activate(id, req.user.companyId);
  }
}
