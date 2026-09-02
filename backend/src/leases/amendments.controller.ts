import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AmendmentsService } from './amendments.service';
import { CreateAmendmentDto } from './dto/create-amendment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('amendments')
@Authenticated('leases')
export class AmendmentsController {
  constructor(private readonly amendmentsService: AmendmentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createAmendmentDto: CreateAmendmentDto, @Request() req: any) {
    return this.amendmentsService.create(createAmendmentDto, req.user);
  }

  @Get('lease/:leaseId')
  findByLease(@Param('leaseId') leaseId: string, @Request() req: any) {
    return this.amendmentsService.findByLease(leaseId, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.findOne(id, req.user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  approve(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.approve(id, req.user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  reject(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.reject(id, req.user);
  }
}
