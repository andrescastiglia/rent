import {
  AmendmentReviewDto,
  ReviewAmendmentDto,
  ReviewAmendmentResultDto,
} from './dto/review-amendment.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
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
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
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

  @Post(':id/reviews')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAmendmentDto,
    @Request() req: any,
  ): Promise<ReviewAmendmentResultDto> {
    return this.amendmentsService.review(id, dto, req.user);
  }

  @Get(':id/reviews')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  reviews(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<AmendmentReviewDto[]> {
    return this.amendmentsService.reviewHistory(id, req.user);
  }

  @Patch(':id/submit')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  submit(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.submit(id, req.user);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  approve(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.approve(id, req.user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  reject(@Param('id') id: string, @Request() req: any) {
    return this.amendmentsService.reject(id, req.user);
  }
}
