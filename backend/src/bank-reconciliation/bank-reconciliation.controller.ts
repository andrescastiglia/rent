import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BankReconciliationService } from './bank-reconciliation.service';
import { CreateSandboxBankMovementDto } from './dto/create-sandbox-bank-movement.dto';
import { BankReconciliationAlertStatus } from './entities/bank-reconciliation-alert.entity';

interface AuthenticatedRequest {
  user: { id: string; companyId: string };
}

@Controller('bank-reconciliation')
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Post('sandbox/movements')
  ingestSandboxMovement(
    @Request() request: AuthenticatedRequest,
    @Body() dto: CreateSandboxBankMovementDto,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Sandbox bank ingestion is disabled');
    }
    return this.service.ingestSandboxMovement(request.user.companyId, dto);
  }

  @Post('movements/:id/reconcile')
  reconcile(
    @Request() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.reconcile(id, request.user.companyId);
  }

  @Public()
  @Post('internal/movements/:id/reconcile')
  reconcileFromBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-batch-bank-token') token?: string,
  ) {
    this.service.assertBatchToken(token);
    return this.service.reconcileInternal(id);
  }

  @Get('alerts')
  findAlerts(
    @Request() request: AuthenticatedRequest,
    @Query(
      'status',
      new ParseEnumPipe(BankReconciliationAlertStatus, { optional: true }),
    )
    status?: BankReconciliationAlertStatus,
  ) {
    return this.service.findAlerts(request.user.companyId, status);
  }

  @Patch('alerts/:id/resolve')
  resolveAlert(
    @Request() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.resolveAlert(
      id,
      request.user.companyId,
      request.user.id,
    );
  }
}
