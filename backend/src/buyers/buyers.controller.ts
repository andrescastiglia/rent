import {
  Body,
  Controller,
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
import { BuyersService } from './buyers.service';
import { BuyerFiltersDto } from './dto/buyer-filters.dto';
import { CreateBuyerDto } from './dto/create-buyer.dto';
import { UpdateBuyerDto } from './dto/update-buyer.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    companyId: string;
    role: UserRole;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('buyers')
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  findAll(
    @Query() query: BuyerFiltersDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.buyersService.findAll(query, req.user.companyId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.BUYER)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.buyersService.findOne(id, req.user.companyId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  create(@Body() dto: CreateBuyerDto, @Request() req: AuthenticatedRequest) {
    return this.buyersService.create(dto, req.user.companyId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuyerDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.buyersService.update(id, dto, req.user.companyId);
  }
}
