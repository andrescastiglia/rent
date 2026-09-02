import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantAccountsService } from './tenant-accounts.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Authenticated } from '../common/decorators/authenticated.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * Controlador para gestión de cuentas corrientes.
 */
@UseGuards(AuthGuard('jwt'))
@Roles(UserRole.ADMIN, UserRole.STAFF, UserRole.OWNER, UserRole.TENANT)
@Authenticated('payments')
@Controller('tenant-accounts')
export class TenantAccountsController {
  constructor(private readonly tenantAccountsService: TenantAccountsService) {}

  /**
   * Obtiene la cuenta de un contrato.
   */
  @Get('lease/:leaseId')
  findByLease(@Param('leaseId') leaseId: string, @Request() req: any) {
    return this.tenantAccountsService.findByLeaseScoped(leaseId, req.user);
  }

  /**
   * Obtiene una cuenta por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tenantAccountsService.findOneScoped(id, req.user);
  }

  /**
   * Obtiene los movimientos de una cuenta.
   */
  @Get(':id/movements')
  getMovements(@Param('id') id: string, @Request() req: any) {
    return this.tenantAccountsService.getMovementsScoped(id, req.user);
  }

  /**
   * Obtiene el balance y mora de una cuenta.
   */
  @Get(':id/balance')
  getBalance(@Param('id') id: string, @Request() req: any) {
    return this.tenantAccountsService.getBalanceInfoScoped(id, req.user);
  }
}
