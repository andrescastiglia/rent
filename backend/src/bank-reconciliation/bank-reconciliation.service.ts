import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import {
  PaymentMethod,
  PaymentStatus,
} from '../payments/entities/payment.entity';
import { PaymentsService } from '../payments/payments.service';
import { CreateSandboxBankMovementDto } from './dto/create-sandbox-bank-movement.dto';
import {
  BankReconciliationAlert,
  BankReconciliationAlertStatus,
} from './entities/bank-reconciliation-alert.entity';
import {
  BankMatchStrategy,
  BankReconciliation,
  BankReconciliationStatus,
} from './entities/bank-reconciliation.entity';
import {
  BankMovement,
  BankMovementDirection,
  BankMovementStatus,
} from './entities/bank-movement.entity';

type MatchResult = {
  invoice: Invoice;
  strategy: BankMatchStrategy;
};

@Injectable()
export class BankReconciliationService {
  private static readonly SANDBOX_PROVIDER = 'sandbox';
  private static readonly DATE_MATCH_WINDOW_DAYS = 5;

  constructor(
    @InjectRepository(BankMovement)
    private readonly movementsRepository: Repository<BankMovement>,
    @InjectRepository(BankReconciliation)
    private readonly reconciliationsRepository: Repository<BankReconciliation>,
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepository: Repository<BankAccount>,
    @InjectRepository(Invoice)
    private readonly invoicesRepository: Repository<Invoice>,
    @InjectRepository(BankReconciliationAlert)
    private readonly alertsRepository: Repository<BankReconciliationAlert>,
    private readonly paymentsService: PaymentsService,
    private readonly dataSource: DataSource,
  ) {}

  assertBatchToken(token?: string): void {
    const expected =
      process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN?.trim() ?? '';
    if (!expected) {
      throw new ServiceUnavailableException(
        'Batch bank reconciliation token is not configured',
      );
    }
    const received = Buffer.from(token ?? '');
    const configured = Buffer.from(expected);
    if (
      received.length !== configured.length ||
      !timingSafeEqual(received, configured)
    ) {
      throw new UnauthorizedException(
        'Invalid batch bank reconciliation token',
      );
    }
  }

  async reconcileInternal(movementId: string): Promise<BankReconciliation> {
    const movement = await this.movementsRepository.findOne({
      where: { id: movementId },
    });
    if (!movement) throw new NotFoundException('Bank movement not found');
    return this.reconcile(movementId, movement.companyId);
  }

  findAlerts(
    companyId: string,
    status: BankReconciliationAlertStatus = BankReconciliationAlertStatus.OPEN,
  ): Promise<BankReconciliationAlert[]> {
    return this.alertsRepository.find({
      where: { companyId, status },
      relations: ['movement'],
      order: { lastDetectedAt: 'DESC' },
    });
  }

  async resolveAlert(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<BankReconciliationAlert> {
    const alert = await this.alertsRepository.findOne({
      where: { id, companyId },
    });
    if (!alert) {
      throw new NotFoundException('Bank reconciliation alert not found');
    }
    alert.status = BankReconciliationAlertStatus.RESOLVED;
    alert.resolvedAt = new Date();
    alert.resolvedBy = userId;
    return this.alertsRepository.save(alert);
  }

  async ingestSandboxMovement(
    companyId: string,
    dto: CreateSandboxBankMovementDto,
  ): Promise<BankReconciliation> {
    const existingMovement = await this.movementsRepository.findOne({
      where: {
        companyId,
        provider: BankReconciliationService.SANDBOX_PROVIDER,
        externalId: dto.externalId,
      },
    });
    if (existingMovement) {
      return this.reconcile(existingMovement.id, companyId);
    }

    const bankAccountId = await this.resolveBankAccountId(companyId, dto);
    let movement = this.movementsRepository.create({
      companyId,
      bankAccountId,
      provider: BankReconciliationService.SANDBOX_PROVIDER,
      externalId: dto.externalId,
      direction: dto.direction,
      amount: dto.amount,
      currency: dto.currency ?? 'ARS',
      occurredAt: new Date(dto.occurredAt),
      description: dto.description ?? null,
      counterparty: dto.counterparty ?? null,
      rawPayload: dto.rawPayload ?? {},
      status: BankMovementStatus.PENDING,
    });

    try {
      movement = await this.movementsRepository.save(movement);
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.movementsRepository.findOne({
        where: {
          companyId,
          provider: BankReconciliationService.SANDBOX_PROVIDER,
          externalId: dto.externalId,
        },
      });
      if (!concurrent) throw error;
      movement = concurrent;
    }

    return this.reconcile(movement.id, companyId);
  }

  async reconcile(
    movementId: string,
    companyId: string,
  ): Promise<BankReconciliation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        movementId,
      ]);
      const result = await this.reconcileLocked(movementId, companyId);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async reconcileLocked(
    movementId: string,
    companyId: string,
  ): Promise<BankReconciliation> {
    const movement = await this.movementsRepository.findOne({
      where: { id: movementId, companyId },
      relations: ['bankAccount'],
    });
    if (!movement) {
      throw new NotFoundException('Bank movement not found');
    }

    const reconciliation = await this.getOrCreateReconciliation(movement);
    if (reconciliation.status === BankReconciliationStatus.MATCHED) {
      return this.findReconciliation(reconciliation.id, companyId);
    }

    if (movement.direction !== BankMovementDirection.CREDIT) {
      movement.status = BankMovementStatus.IGNORED;
      await this.movementsRepository.save(movement);
      return this.markUnmatched(
        reconciliation,
        'Only incoming credit movements can be reconciled',
      );
    }

    try {
      let match: MatchResult | null = null;
      if (reconciliation.invoiceId && reconciliation.matchStrategy) {
        const invoice = await this.invoicesRepository.findOne({
          where: { id: reconciliation.invoiceId, companyId },
        });
        if (invoice) {
          match = { invoice, strategy: reconciliation.matchStrategy };
        }
      }
      match ??= await this.findInvoiceMatch(movement);

      if (!match) {
        movement.status = BankMovementStatus.UNMATCHED;
        await this.movementsRepository.save(movement);
        return this.markUnmatched(
          reconciliation,
          'No unique pending invoice matched the movement',
        );
      }

      reconciliation.invoiceId = match.invoice.id;
      reconciliation.matchStrategy = match.strategy;
      reconciliation.status = BankReconciliationStatus.PROCESSING;
      reconciliation.reason = null;
      await this.reconciliationsRepository.save(reconciliation);

      let paymentId = reconciliation.paymentId;
      if (!paymentId) {
        const payment = await this.paymentsService.create(
          {
            tenantAccountId: match.invoice.tenantAccountId,
            amount: Number(movement.amount),
            currencyCode: movement.currency,
            paymentDate: this.toDateOnly(movement.occurredAt),
            method: PaymentMethod.BANK_TRANSFER,
            reference: `${movement.provider}:${movement.externalId}`,
            notes: `Conciliación bancaria automática (${match.strategy})`,
          },
          undefined,
          companyId,
        );
        paymentId = payment.id;
        reconciliation.paymentId = paymentId;
        await this.reconciliationsRepository.save(reconciliation);
      }

      const payment = await this.paymentsService.findOne(paymentId);
      if (payment.status === PaymentStatus.PENDING) {
        await this.paymentsService.confirm(paymentId);
      } else if (payment.status !== PaymentStatus.COMPLETED) {
        throw new BadRequestException(
          `Reconciliation payment has non-confirmable status: ${payment.status}`,
        );
      }

      movement.status = BankMovementStatus.RECONCILED;
      await this.movementsRepository.save(movement);
      reconciliation.status = BankReconciliationStatus.MATCHED;
      reconciliation.matchedAt = new Date();
      reconciliation.reason = null;
      await this.reconciliationsRepository.save(reconciliation);
      return this.findReconciliation(reconciliation.id, companyId);
    } catch (error) {
      reconciliation.status = BankReconciliationStatus.FAILED;
      reconciliation.reason =
        error instanceof Error ? error.message : 'Reconciliation failed';
      await this.reconciliationsRepository.save(reconciliation);
      throw error;
    }
  }

  private async resolveBankAccountId(
    companyId: string,
    dto: CreateSandboxBankMovementDto,
  ): Promise<string | null> {
    if (dto.bankAccountId) {
      const account = await this.bankAccountsRepository.findOne({
        where: { id: dto.bankAccountId, companyId, isActive: true },
      });
      if (!account) {
        throw new BadRequestException('Active bank account not found');
      }
      return account.id;
    }

    if (!dto.description) return null;
    const accounts = await this.bankAccountsRepository
      .createQueryBuilder('account')
      .where('account.company_id = :companyId', { companyId })
      .andWhere('account.is_active = TRUE')
      .andWhere('account.is_virtual_alias = TRUE')
      .andWhere('account.deleted_at IS NULL')
      .andWhere('account.alias IS NOT NULL')
      .andWhere(
        "LOWER(:description) LIKE CONCAT('%', LOWER(account.alias), '%')",
        {
          description: dto.description,
        },
      )
      .take(2)
      .getMany();
    return accounts.length === 1 ? accounts[0].id : null;
  }

  private async findInvoiceMatch(
    movement: BankMovement,
  ): Promise<MatchResult | null> {
    if (movement.bankAccount?.propertyId) {
      const invoice = await this.basePendingInvoiceQuery(movement)
        .andWhere('lease.property_id = :propertyId', {
          propertyId: movement.bankAccount.propertyId,
        })
        .orderBy('invoice.due_date', 'ASC')
        .addOrderBy('invoice.created_at', 'ASC')
        .getOne();
      if (invoice) {
        return { invoice, strategy: BankMatchStrategy.VIRTUAL_ALIAS };
      }
    }

    const candidates = await this.basePendingInvoiceQuery(movement)
      .andWhere('(invoice.total_amount - invoice.paid_amount) = :amount', {
        amount: Number(movement.amount),
      })
      .andWhere(
        'ABS(invoice.due_date - CAST(:occurredAt AS date)) <= :dateWindow',
        {
          occurredAt: movement.occurredAt.toISOString(),
          dateWindow: BankReconciliationService.DATE_MATCH_WINDOW_DAYS,
        },
      )
      .take(2)
      .getMany();
    return candidates.length === 1
      ? {
          invoice: candidates[0],
          strategy: BankMatchStrategy.EXACT_AMOUNT_DATE,
        }
      : null;
  }

  private basePendingInvoiceQuery(movement: BankMovement) {
    return this.invoicesRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.lease', 'lease')
      .where('invoice.company_id = :companyId', {
        companyId: movement.companyId,
      })
      .andWhere('invoice.status IN (:...statuses)', {
        statuses: [
          InvoiceStatus.PENDING,
          InvoiceStatus.SENT,
          InvoiceStatus.PARTIAL,
          InvoiceStatus.OVERDUE,
        ],
      })
      .andWhere('invoice.tenant_account_id IS NOT NULL')
      .andWhere('invoice.currency = :currency', {
        currency: movement.currency,
      });
  }

  private async getOrCreateReconciliation(
    movement: BankMovement,
  ): Promise<BankReconciliation> {
    const existing = await this.reconciliationsRepository.findOne({
      where: { movementId: movement.id },
    });
    if (existing) return existing;

    try {
      return await this.reconciliationsRepository.save(
        this.reconciliationsRepository.create({
          companyId: movement.companyId,
          movementId: movement.id,
          invoiceId: null,
          paymentId: null,
          matchStrategy: null,
          status: BankReconciliationStatus.PROCESSING,
          reason: null,
          matchedAt: null,
        }),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.reconciliationsRepository.findOne({
        where: { movementId: movement.id },
      });
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  private async markUnmatched(
    reconciliation: BankReconciliation,
    reason: string,
  ): Promise<BankReconciliation> {
    reconciliation.status = BankReconciliationStatus.UNMATCHED;
    reconciliation.reason = reason;
    reconciliation.matchedAt = null;
    return this.reconciliationsRepository.save(reconciliation);
  }

  private async findReconciliation(
    id: string,
    companyId: string,
  ): Promise<BankReconciliation> {
    const reconciliation = await this.reconciliationsRepository.findOne({
      where: { id, companyId },
      relations: ['movement', 'invoice', 'payment', 'payment.receipt'],
    });
    if (!reconciliation) {
      throw new NotFoundException('Bank reconciliation not found');
    }
    return reconciliation;
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
