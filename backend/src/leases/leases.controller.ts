import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { LeasesService } from './leases.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeaseFiltersDto } from './dto/lease-filters.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('leases')
@UseGuards(AuthGuard('jwt'))
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createLeaseDto: CreateLeaseDto) {
    return this.leasesService.create(createLeaseDto);
  }

  @Get()
  findAll(@Query() filters: LeaseFiltersDto) {
    return this.leasesService.findAll(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leasesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(@Param('id') id: string, @Body() updateLeaseDto: UpdateLeaseDto) {
    return this.leasesService.update(id, updateLeaseDto);
  }

  @Post(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  activate(@Param('id') id: string) {
    return this.leasesService.activate(id);
  }

  @Post(':id/terminate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  terminate(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.leasesService.terminate(id, reason);
  }

  @Post(':id/renew')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  renew(@Param('id') id: string, @Body() newTerms: Partial<CreateLeaseDto>) {
    return this.leasesService.renew(id, newTerms);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async remove(@Param('id') id: string) {
    await this.leasesService.remove(id);
    return { message: 'Lease deleted successfully' };
  }
}
