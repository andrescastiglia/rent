import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantAccountsService } from './tenant-accounts.service';

/**
 * Controlador para gestión de cuentas corrientes.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('tenant-accounts')
export class TenantAccountsController {
  constructor(private readonly tenantAccountsService: TenantAccountsService) {}

  /**
   * Obtiene la cuenta de un contrato.
   */
  @Get('lease/:leaseId')
  findByLease(@Param('leaseId') leaseId: string) {
    return this.tenantAccountsService.findByLease(leaseId);
  }

  /**
   * Obtiene una cuenta por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantAccountsService.findOne(id);
  }

  /**
   * Obtiene los movimientos de una cuenta.
   */
  @Get(':id/movements')
  getMovements(@Param('id') id: string) {
    return this.tenantAccountsService.getMovements(id);
  }

  /**
   * Obtiene el balance y mora de una cuenta.
   */
  @Get(':id/balance')
  getBalance(@Param('id') id: string) {
    return this.tenantAccountsService.getBalanceInfo(id);
  }
}
