import {
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
} from '@nestjs/common';
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

interface AuthenticatedRequest {
  user: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    phone?: string;
  };
}

@Controller('owners')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.STAFF)
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Get('settlements/payments')
  async listSettlementPayments(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? Number.parseInt(limit, 10) : 100;
    return this.ownersService.listSettlementPayments(
      req.user.companyId,
      req.user,
      Number.isFinite(parsed) ? parsed : 100,
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
  async findAll(@Request() req: AuthenticatedRequest): Promise<Owner[]> {
    return this.ownersService.findAll(req.user.companyId);
  }

  @Post()
  async create(
    @Body() dto: CreateOwnerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.create(dto, req.user.companyId);
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

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Owner> {
    return this.ownersService.update(id, dto, req.user.companyId);
  }

  @Get(':id/settlements')
  async listSettlements(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: 'all' | 'pending' | 'completed',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 12;
    return this.ownersService.listSettlements(
      id,
      req.user.companyId,
      req.user,
      status ?? 'all',
      Number.isFinite(parsedLimit) ? parsedLimit : 12,
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
    return this.ownersService.listActivities(id, req.user.companyId);
  }

  @Post(':id/activities')
  async createActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity> {
    return this.ownersService.createActivity(id, dto, {
      id: req.user.id,
      companyId: req.user.companyId,
    });
  }

  @Patch(':id/activities/:activityId')
  async updateActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: UpdateOwnerActivityDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<OwnerActivity> {
    return this.ownersService.updateActivity(
      id,
      activityId,
      dto,
      req.user.companyId,
    );
  }
}
