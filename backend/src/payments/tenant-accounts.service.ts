import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { TenantAccount } from './entities/tenant-account.entity';
import {
  TenantAccountMovement,
  MovementType,
} from './entities/tenant-account-movement.entity';
import { Lease, LateFeeType } from '../leases/entities/lease.entity';
import { InvoiceStatus } from './entities/invoice.entity';
import { UserRole } from '../users/entities/user.entity';
import {
  getUserRoles,
  isAdminOrStaff,
} from '../common/helpers/role-scope.helper';

type TenantAccountActor = {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
};

export type AddTenantAccountMovementInput = {
  accountId: string;
  type: MovementType;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  companyId: string;
};

/**
 * Servicio para gestionar cuentas corrientes de inquilinos.
 */
@Injectable()
export class TenantAccountsService {
  constructor(
    @InjectRepository(TenantAccount)
    private readonly accountsRepository: Repository<TenantAccount>,
    @InjectRepository(TenantAccountMovement)
    private readonly movementsRepository: Repository<TenantAccountMovement>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crea una cuenta corriente para un contrato.
   * @param leaseId ID del contrato
   * @returns La cuenta creada
   */
  async createForLease(
    leaseId: string,
    companyId: string = '',
  ): Promise<TenantAccount> {
    const lease = await this.leasesRepository.findOne({
      where: { id: leaseId, companyId },
    });

    if (!lease) {
      throw new NotFoundException(`Lease with ID ${leaseId} not found`);
    }

    const existingAccount = await this.accountsRepository.findOne({
      where: { leaseId, companyId },
    });

    if (existingAccount) {
      return existingAccount;
    }

    if (!lease.tenantId) {
      throw new NotFoundException(
        `Lease ${leaseId} does not have an assigned tenant account holder`,
      );
    }

    const account = this.accountsRepository.create({
      companyId: lease.companyId,
      tenantId: lease.tenantId,
      leaseId,
      balance: 0,
      currencyCode: lease.currency,
    });

    return this.accountsRepository.save(account);
  }

  /**
   * Obtiene una cuenta por su ID.
   * @param id ID de la cuenta
   * @returns La cuenta
   */
  async findOne(id: string, companyId: string = ''): Promise<TenantAccount> {
    const account = await this.accountsRepository.findOne({
      where: { id, companyId },
      relations: ['lease', 'lease.tenant', 'lease.property'],
    });

    if (!account) {
      throw new NotFoundException(`Tenant account with ID ${id} not found`);
    }

    return account;
  }

  async findOneScoped(
    id: string,
    user: TenantAccountActor,
  ): Promise<TenantAccount> {
    return this.findScoped({ id }, user, `Tenant account with ID ${id}`);
  }

  /**
   * Obtiene la cuenta de un contrato.
   * @param leaseId ID del contrato
   * @returns La cuenta
   */
  async findByLease(
    leaseId: string,
    companyId: string = '',
  ): Promise<TenantAccount> {
    const account = await this.accountsRepository.findOne({
      where: { leaseId, companyId },
      relations: ['lease', 'lease.tenant', 'lease.property'],
    });

    if (!account) {
      throw new NotFoundException(
        `Tenant account for lease ${leaseId} not found`,
      );
    }
    return account;
  }

  async findByLeaseScoped(
    leaseId: string,
    user: TenantAccountActor,
  ): Promise<TenantAccount> {
    return this.findScoped(
      { leaseId },
      user,
      `Tenant account for lease ${leaseId}`,
    );
  }

  /**
   * Obtiene los movimientos de una cuenta.
   * @param accountId ID de la cuenta
   * @returns Lista de movimientos
   */
  async getMovements(
    accountId: string,
    companyId: string = '',
  ): Promise<TenantAccountMovement[]> {
    await this.findOne(accountId, companyId);
    return this.movementsRepository.find({
      where: { tenantAccountId: accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMovementsScoped(
    accountId: string,
    user: TenantAccountActor,
  ): Promise<TenantAccountMovement[]> {
    await this.findOneScoped(accountId, user);
    return this.movementsRepository.find({
      where: { tenantAccountId: accountId },
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
    companyId?: string,
  ): Promise<TenantAccountMovement> {
    if (!companyId) {
      throw new NotFoundException(
        `Tenant account with ID ${accountId} not found`,
      );
    }

    return this.dataSource.transaction((manager) =>
      this.addMovementWithManager(manager, {
        accountId,
        type,
        amount,
        referenceType,
        referenceId,
        description,
        companyId,
      }),
    );
  }

  async addMovementWithManager(
    manager: EntityManager,
    input: AddTenantAccountMovementInput,
  ): Promise<TenantAccountMovement> {
    const {
      accountId,
      type,
      amount,
      referenceType,
      referenceId,
      description,
      companyId,
    } = input;
    const accountsRepository = manager.getRepository(TenantAccount);
    const movementsRepository = manager.getRepository(TenantAccountMovement);
    const account = await accountsRepository.findOne({
      where: { id: accountId, companyId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!account) {
      throw new NotFoundException(
        `Tenant account with ID ${accountId} not found`,
      );
    }

    const newBalance = Number(account.balance) + amount;
    await accountsRepository.update(
      { id: accountId, companyId },
      {
        balance: newBalance,
        lastMovementAt: new Date(),
      },
    );

    const movement = movementsRepository.create({
      tenantAccountId: accountId,
      movementType: type,
      amount,
      balanceAfter: newBalance,
      referenceType,
      referenceId,
      description: description || '',
    });

    return movementsRepository.save(movement);
  }

  /**
   * Calcula la mora pendiente de una cuenta.
   * @param accountId ID de la cuenta
   * @returns Monto de mora calculado
   */
  async calculateLateFee(
    accountId: string,
    companyId: string = '',
  ): Promise<number> {
    const account = await this.accountsRepository.findOne({
      where: { id: accountId, companyId },
      relations: ['lease', 'invoices'],
    });

    if (!account?.lease) {
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
        inv.status !== InvoiceStatus.PAID &&
        inv.status !== InvoiceStatus.CANCELLED &&
        inv.status !== InvoiceStatus.REFUNDED &&
        new Date(inv.dueDate) < new Date(),
    );

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return 0;
    }

    let totalLateFee = 0;

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(invoice.dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysOverdue <= 0) continue;

      const pendingAmount = Number(invoice.total) - Number(invoice.amountPaid);

      if (lease.lateFeeType === LateFeeType.DAILY_PERCENTAGE) {
        // Tasa diaria (porcentaje)
        const dailyRate = Number(lease.lateFeeValue) / 100;
        totalLateFee += pendingAmount * dailyRate * daysOverdue;
      } else if (lease.lateFeeType === LateFeeType.DAILY_FIXED) {
        // Monto fijo por día
        totalLateFee += Number(lease.lateFeeValue) * daysOverdue;
      } else if (lease.lateFeeType === LateFeeType.PERCENTAGE) {
        // Porcentaje único
        totalLateFee += pendingAmount * (Number(lease.lateFeeValue) / 100);
      } else if (lease.lateFeeType === LateFeeType.FIXED) {
        // Monto fijo único
        totalLateFee += Number(lease.lateFeeValue);
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
    companyId: string = '',
  ): Promise<{ balance: number; lateFee: number; total: number }> {
    const account = await this.findOne(accountId, companyId);
    const lateFee = await this.calculateLateFee(accountId, companyId);

    return {
      balance: Number(account.balance),
      lateFee,
      total: Number(account.balance) + lateFee,
    };
  }

  async getBalanceInfoScoped(
    accountId: string,
    user: TenantAccountActor,
  ): Promise<{ balance: number; lateFee: number; total: number }> {
    const account = await this.findOneScoped(accountId, user);
    const lateFee = await this.calculateLateFee(accountId, user.companyId);
    return {
      balance: Number(account.balance),
      lateFee,
      total: Number(account.balance) + lateFee,
    };
  }

  private async findScoped(
    filters: { id?: string; leaseId?: string },
    user: TenantAccountActor,
    label: string,
  ): Promise<TenantAccount> {
    if (!user.companyId) {
      throw new ForbiddenException('Company scope required');
    }

    const query = this.accountsRepository
      .createQueryBuilder('account')
      .leftJoinAndSelect('account.lease', 'lease')
      .leftJoinAndSelect('lease.tenant', 'tenant')
      .leftJoinAndSelect('tenant.user', 'tenantUser')
      .leftJoinAndSelect('lease.property', 'property')
      .leftJoinAndSelect('property.owner', 'owner')
      .leftJoinAndSelect('owner.user', 'ownerUser')
      .where('account.company_id = :companyId', { companyId: user.companyId });

    this.applyScopedFilters(query, filters);
    this.applyVisibilityScope(query, user);

    const account = await query.getOne();
    if (!account) {
      throw new NotFoundException(`${label} not found`);
    }
    return account;
  }

  private applyScopedFilters(
    query: SelectQueryBuilder<TenantAccount>,
    filters: { id?: string; leaseId?: string },
  ): void {
    if (filters.id) {
      query.andWhere('account.id = :accountId', { accountId: filters.id });
    }
    if (filters.leaseId) {
      query.andWhere('account.lease_id = :leaseId', {
        leaseId: filters.leaseId,
      });
    }
  }

  private applyVisibilityScope(
    query: SelectQueryBuilder<TenantAccount>,
    user: TenantAccountActor,
  ): void {
    if (isAdminOrStaff(user)) {
      return;
    }
    const roles = getUserRoles(user);
    const scopes = [
      roles.includes(UserRole.OWNER) ? 'owner.user_id = :scopeUserId' : null,
      roles.includes(UserRole.TENANT) ? 'tenant.user_id = :scopeUserId' : null,
    ].filter((scope): scope is string => Boolean(scope));
    if (scopes.length > 0) {
      query.andWhere(`(${scopes.join(' OR ')})`, { scopeUserId: user.id });
      return;
    }
    throw new ForbiddenException('Unsupported tenant account access role');
  }
}
