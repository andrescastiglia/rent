import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { OwnersService } from './owners.service';
import { Owner } from './entities/owner.entity';

interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    companyId: string;
    role: string;
  };
}

@Controller('owners')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) { }

  /**
   * Get all owners for the authenticated user's company.
   */
  @Get()
  async findAll(@Request() req: AuthenticatedRequest): Promise<Owner[]> {
    return this.ownersService.findAll(req.user.companyId);
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
}
