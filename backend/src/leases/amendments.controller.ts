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
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('amendments')
export class AmendmentsController {
  constructor(private readonly amendmentsService: AmendmentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  create(@Body() createAmendmentDto: CreateAmendmentDto, @Request() req: any) {
    return this.amendmentsService.create(createAmendmentDto, req.user.id);
  }

  @Get('lease/:leaseId')
  findByLease(@Param('leaseId') leaseId: string) {
    return this.amendmentsService.findByLease(leaseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.amendmentsService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  approve(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.approve(id, req.user.id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  reject(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.reject(id, req.user.id);
  }
}
