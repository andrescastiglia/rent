import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('units')
@Authenticated('properties')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(
    @Body() createUnitDto: CreateUnitDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.unitsService.create(createUnitDto, req.user, executionKey);
  }

  @Get('property/:propertyId')
  findByProperty(@Param('propertyId') propertyId: string, @Request() req: any) {
    return this.unitsService.findByProperty(propertyId, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.unitsService.findOne(id, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(
    @Param('id') id: string,
    @Body() updateUnitDto: UpdateUnitDto,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    return this.unitsService.update(id, updateUnitDto, req.user, executionKey);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(
    @Param('id') id: string,
    @Request() req: any,
    @Headers('idempotency-key') executionKey?: string,
  ) {
    await this.unitsService.remove(id, req.user, executionKey);
    return { message: 'Unit deleted successfully' };
  }
}
