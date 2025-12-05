import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAccount } from './entities/tenant-account.entity';
import {
  TenantAccountMovement,
  MovementType,
} from './entities/tenant-account-movement.entity';
import { Lease } from '../leases/entities/lease.entity';

/**
 * Servicio para gestionar cuentas corrientes de inquilinos.
 */
@Injectable()
export class TenantAccountsService {
  constructor(
    @InjectRepository(TenantAccount)
    private accountsRepository: Repository<TenantAccount>,
    @InjectRepository(TenantAccountMovement)
    private movementsRepository: Repository<TenantAccountMovement>,
    @InjectRepository(Lease)
    private leasesRepository: Repository<Lease>,
  ) {}

  /**
   * Crea una cuenta corriente para un contrato.
   * @param leaseId ID del contrato
   * @returns La cuenta creada
   */
  async createForLease(leaseId: string): Promise<TenantAccount> {
    const lease = await this.leasesRepository.findOne({
      where: { id: leaseId },
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${leaseId} not found`);
    }

    const existingAccount = await this.accountsRepository.findOne({
      where: { leaseId },
    });

    if (existingAccount) {
      return existingAccount;
    }

    const account = this.accountsRepository.create({
      leaseId,
      balance: 0,
    });

    return this.accountsRepository.save(account);
  }

  /**
   * Obtiene una cuenta por su ID.
   * @param id ID de la cuenta
   * @returns La cuenta
   */
  async findOne(id: string): Promise<TenantAccount> {
    const account = await this.accountsRepository.findOne({
      where: { id },
      relations: ['lease', 'lease.tenant', 'lease.unit', 'lease.unit.property'],
    });

    if (!account) {
      throw new NotFoundException(`Tenant account with ID ${id} not found`);
    }

    return account;
  }

  /**
   * Obtiene la cuenta de un contrato.
   * @param leaseId ID del contrato
   * @returns La cuenta
   */
  async findByLease(leaseId: string): Promise<TenantAccount> {
    const account = await this.accountsRepository.findOne({
      where: { leaseId },
      relations: ['lease', 'lease.tenant', 'lease.unit', 'lease.unit.property'],
    });

    if (!account) {
      throw new NotFoundException(
        `Tenant account for lease ${leaseId} not found`,
      );
    }

    return account;
  }

  /**
   * Obtiene los movimientos de una cuenta.
   * @param accountId ID de la cuenta
   * @returns Lista de movimientos
   */
  async getMovements(accountId: string): Promise<TenantAccountMovement[]> {
    return this.movementsRepository.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Registra un movimiento en la cuenta.
   * @param accountId ID de la cuenta
   * @param type Tipo de movimiento
   * @param amount Monto (positivo = deuda, negativo = crédito)
   * @param referenceType Tipo de referencia
   * @param referenceId ID de referencia
   * @param description Descripción
   * @returns El movimiento creado
   */
  async addMovement(
    accountId: string,
    type: MovementType,
    amount: number,
    referenceType?: string,
    referenceId?: string,
    description?: string,
  ): Promise<TenantAccountMovement> {
    const account = await this.findOne(accountId);

    // Actualizar balance
    const newBalance = Number(account.balance) + amount;

    await this.accountsRepository.update(accountId, {
      balance: newBalance,
      lastCalculatedAt: new Date(),
    });

    // Crear movimiento
    const movement = this.movementsRepository.create({
      accountId,
      movementType: type,
      amount,
      balanceAfter: newBalance,
      referenceType,
      referenceId,
      description,
    });

    return this.movementsRepository.save(movement);
  }

  /**
   * Calcula la mora pendiente de una cuenta.
   * @param accountId ID de la cuenta
   * @returns Monto de mora calculado
   */
  async calculateLateFee(accountId: string): Promise<number> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId },
      relations: ['lease', 'invoices'],
    });

    if (!account || !account.lease) {
      return 0;
    }

    const lease = account.lease;

    // Si no tiene configuración de mora, retornar 0
    if (!lease.lateFeeType || !lease.lateFeeValue) {
      return 0;
    }

    // Buscar facturas vencidas no pagadas
    const overdueInvoices = account.invoices?.filter(
      (inv) =>
        inv.status !== 'paid' &&
        inv.status !== 'cancelled' &&
        new Date(inv.dueDate) < new Date(),
    );

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return 0;
    }

    let totalLateFee = 0;

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(invoice.dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysOverdue <= 0) continue;

      const pendingAmount = Number(invoice.total) - Number(invoice.amountPaid);

      if (lease.lateFeeType === 'daily_rate') {
        // Tasa diaria (porcentaje)
        const dailyRate = Number(lease.lateFeeValue) / 100;
        totalLateFee += pendingAmount * dailyRate * daysOverdue;
      } else {
        // Monto fijo por día
        totalLateFee += Number(lease.lateFeeValue) * daysOverdue;
      }
    }

    return Math.round(totalLateFee * 100) / 100;
  }

  /**
   * Obtiene el balance y mora de una cuenta.
   * @param accountId ID de la cuenta
   * @returns Balance y mora
   */
  async getBalanceInfo(
    accountId: string,
  ): Promise<{ balance: number; lateFee: number; total: number }> {
    const account = await this.findOne(accountId);
    const lateFee = await this.calculateLateFee(accountId);

    return {
      balance: Number(account.balance),
      lateFee,
      total: Number(account.balance) + lateFee,
    };
  }
}
