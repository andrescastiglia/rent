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
}
