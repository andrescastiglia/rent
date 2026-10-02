import {
  Headers,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Post,
  UseGuards,
  Request,
  ParseUUIDPipe,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse } from '@nestjs/swagger';

import { OwnerSummaryDto } from './dto/owner-summary.dto';

import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { OwnersService } from './owners.service';
import { Owner } from './entities/owner.entity';
import { OwnerActivity } from './entities/owner-activity.entity';
import { CreateOwnerActivityDto } from './dto/create-owner-activity.dto';
import { UpdateOwnerActivityDto } from './dto/update-owner-activity.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { RegisterOwnerSettlementPaymentDto } from './dto/register-owner-settlement-payment.dto';
import { ListOwnerSettlementsDto } from './dto/list-owner-settlements.dto';
import { ListOwnerSettlementPaymentsDto } from './dto/list-owner-settlement-payments.dto';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { OwnerListQueryDto } from './dto/owner-list-query.dto';
import { OwnerPageDto } from './dto/owner-page.dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    roles?: UserRole[];
    phone?: string;
  };
}

@Controller('owners')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
@Authenticated('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get('settlements/payments')
  async listSettlementPayments(
    @Request() req: AuthenticatedRequest,
    @Query() query: ListOwnerSettlementPaymentsDto,
  ) {
    return this.ownersService.listSettlementPayments(
      req.user.companyId,
      req.user,
      query.limit ?? 100,
    );
  }

  @Get('settlements/:settlementId/receipt')
  async downloadSettlementReceipt(
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const file = await this.ownersService.getSettlementReceipt(
      settlementId,
      req.user.companyId,
      req.user,
    );

    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    });

    return res.send(file.buffer);
  }

  /**
   * Get all owners for the authenticated user's company.
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async findAll(@Request() req: AuthenticatedRequest): Promise<Owner[]> {
    return this.ownersService.findAllScoped(req.user);
  }

  @Get('page')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  @ApiOkResponse({ type: OwnerPageDto })
  async getPage(
    @Request() req: AuthenticatedRequest,
    @Query() query: OwnerListQueryDto,
  ): Promise<OwnerPageDto> {
    return this.ownersService.getPage(req.user, query);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Post()
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async create(
    @Body() dto: CreateOwnerDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<Owner> {
    return this.ownersService.create(dto, req.user.companyId, executionKey);
  }

  /**
   * Get the owner profile for the authenticated user (role=OWNER).
   */
  @Get('me')
  @Roles(UserRole.OWNER)
  async getMyProfile(@Request() req: AuthenticatedRequest): Promise<Owner> {
    const owner = await this.ownersService.findByUserId(
      req.user.id,
      req.user.companyId,
    );
    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }
    return owner;
  }

  /**
   * Get owner summary for the authenticated user (role=OWNER).
   * Returns scoped counts and gross allocated collections by currency for the Argentina business month.
   */
  @Get('me/summary')
  @ApiOkResponse({ type: OwnerSummaryDto })
  @Roles(UserRole.OWNER)
  async getMyProfileSummary(@Request() req: AuthenticatedRequest) {
    return this.ownersService.getOwnerSummary(req.user.id, req.user.companyId);
  }

  /**
   * Get owner by ID.
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.findOneScoped(id, req.user);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<Owner> {
    return this.ownersService.updateScoped(id, dto, req.user, executionKey);
  }

  @Get(':id/settlements')
  async listSettlements(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Query() query: ListOwnerSettlementsDto,
  ) {
    return this.ownersService.listSettlements(
      id,
      req.user.companyId,
      req.user,
      query.status ?? 'all',
      query.limit ?? 12,
    );
  }

  @Post(':id/settlements/:settlementId/pay')
  @Roles(UserRole.ADMIN, UserRole.STAFF)
  async registerSettlementPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('settlementId', ParseUUIDPipe) settlementId: string,
    @Body() dto: RegisterOwnerSettlementPaymentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.ownersService.registerSettlementPayment(
      id,
      settlementId,
      dto,
      req.user,
    );
  }

  @Get(':id/activities')
  async listActivities(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity[]> {
    return this.ownersService.listActivitiesScoped(id, req.user);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Post(':id/activities')
  async createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<OwnerActivity> {
    return this.ownersService.createActivity(id, dto, req.user, executionKey);
  }

  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID conservado para recuperar el resultado de un intento.',
  })
  @Patch(':id/activities/:activityId')
  async updateActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
    @Headers('idempotency-key') executionKey?: string,
  ): Promise<OwnerActivity> {
    return this.ownersService.updateActivityScoped(
      id,
      activityId,
      dto,
      req.user,
      executionKey,
    );
  }
}
