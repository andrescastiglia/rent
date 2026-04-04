import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PortalsService } from './portals.service';
import { PortalListing } from './entities/portal-listing.entity';
import { CreatePortalListingDto } from './dto/create-portal-listing.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
  };
}

@Controller('portals')
@UseGuards(JwtAuthGuard)
export class PortalsController {
  constructor(private readonly portalsService: PortalsService) {}

  @Get('listings')
  @Roles(UserRole.ADMIN)
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('propertyId') propertyId?: string,
  ): Promise<PortalListing[]> {
    return this.portalsService.findAll(req.user.companyId, propertyId);
  }

  @Get('listings/:id')
  @Roles(UserRole.ADMIN)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<PortalListing> {
    return this.portalsService.findOne(id, req.user.companyId);
  }

  @Post('listings')
  @Roles(UserRole.ADMIN)
  async create(
    @Body() dto: CreatePortalListingDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<PortalListing> {
    return this.portalsService.create(req.user.companyId, dto);
  }

  @Post('listings/:id/publish')
  @Roles(UserRole.ADMIN)
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<PortalListing> {
    return this.portalsService.publish(id, req.user.companyId);
  }

  @Post('listings/:id/pause')
  @Roles(UserRole.ADMIN)
  async pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<PortalListing> {
    return this.portalsService.pause(id, req.user.companyId);
  }

  @Delete('listings/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.portalsService.remove(id, req.user.companyId);
  }

  @Post('sync')
  @Roles(UserRole.ADMIN)
  async syncAll(
    @Request() req: AuthenticatedRequest,
  ): Promise<PortalListing[]> {
    return this.portalsService.syncAll(req.user.companyId);
  }
}
