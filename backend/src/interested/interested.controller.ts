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

  @Get(':id/matches')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  findMatches(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.interestedService.findMatches(id, req.user);
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
