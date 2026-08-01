import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BankReconciliationService } from './bank-reconciliation.service';
import { CreateSandboxBankMovementDto } from './dto/create-sandbox-bank-movement.dto';

interface AuthenticatedRequest {
  user: { companyId: string };
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
}
