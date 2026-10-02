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
import {
  CreateAmendmentRequestDto,
  AmendmentTransitionDto,
} from './dto/amendment-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { SelfServiceAction } from '../common/decorators/self-service-action.decorator';
import { UserRole } from '../users/entities/user.entity';

@UseGuards(AuthGuard('jwt'))
@Controller('amendments')
@Authenticated('leases')
export class AmendmentsController {
  constructor(private readonly amendmentsService: AmendmentsService) {}

  @Post()
  @SelfServiceAction('amendment.create')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  create(@Body() request: CreateAmendmentRequestDto, @Request() req: any) {
    const { idempotencyKey, ...dto } = request;
    return this.amendmentsService.create(dto, req.user, idempotencyKey);
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
  @SelfServiceAction('amendment.submit')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AmendmentTransitionDto = {},
  ) {
    return this.amendmentsService.submit(
      id,
      req.user,
      dto.idempotencyKey,
      dto.expectedUpdatedAt,
    );
  }

  @Patch(':id/approve')
  @SelfServiceAction('amendment.approve')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AmendmentTransitionDto = {},
  ) {
    return this.amendmentsService.approve(
      id,
      req.user,
      dto.idempotencyKey,
      dto.expectedUpdatedAt,
    );
  }

  @Patch(':id/reject')
  @SelfServiceAction('amendment.reject')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: AmendmentTransitionDto = {},
  ) {
    return this.amendmentsService.reject(
      id,
      req.user,
      dto.idempotencyKey,
      dto.expectedUpdatedAt,
    );
  }
}
