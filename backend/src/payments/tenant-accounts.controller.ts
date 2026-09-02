import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantAccountsService } from './tenant-accounts.service';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Controlador para gestión de cuentas corrientes.
 */
@UseGuards(AuthGuard('jwt'))
@Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
@Controller('tenant-accounts')
export class TenantAccountsController {
  constructor(private readonly tenantAccountsService: TenantAccountsService) {}

  /**
   * Obtiene la cuenta de un contrato.
   */
  @Get('lease/:leaseId')
  findByLease(@Param('leaseId') leaseId: string, @Request() req?: any) {
    return this.tenantAccountsService.findByLease(
      leaseId,
      req?.user?.companyId ?? '',
    );
  }

  /**
   * Obtiene una cuenta por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: any) {
    return this.tenantAccountsService.findOne(id, req?.user?.companyId ?? '');
  }

  /**
   * Obtiene los movimientos de una cuenta.
   */
  @Get(':id/movements')
  getMovements(@Param('id') id: string, @Request() req?: any) {
    return this.tenantAccountsService.getMovements(
      id,
      req?.user?.companyId ?? '',
    );
  }

  /**
   * Obtiene el balance y mora de una cuenta.
   */
  @Get(':id/balance')
  getBalance(@Param('id') id: string, @Request() req?: any) {
    return this.tenantAccountsService.getBalanceInfo(
      id,
      req?.user?.companyId ?? '',
    );
  }
}
