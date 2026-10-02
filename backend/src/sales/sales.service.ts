import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SaleFolder } from './entities/sale-folder.entity';
import { SaleAgreement } from './entities/sale-agreement.entity';
import { SaleReceipt } from './entities/sale-receipt.entity';
import { CreateSaleFolderDto } from './dto/create-sale-folder.dto';
import { CreateSaleAgreementDto } from './dto/create-sale-agreement.dto';
import { CreateSaleReceiptDto } from './dto/create-sale-receipt.dto';
import { Buyer } from '../buyers/entities/buyer.entity';
import {
  ContractSignatureStatus,
  ContractType,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { Property } from '../properties/entities/property.entity';
import { withDomainOperationReceipt } from '../common/helpers/domain-operation-receipt';
import { UserRole } from '../users/entities/user.entity';
import { hasRole, isAdminOrStaff } from '../common/helpers/role-scope.helper';
import { CancelSaleReceiptDto } from './dto/cancel-sale-receipt.dto';
import { paymentCents, paymentNumber } from '../payments/payment-amount';

interface UserContext {
  companyId?: string;
  id?: string;
  role?: UserRole;
  roles?: UserRole[];
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SaleFolder)
    private readonly foldersRepository: Repository<SaleFolder>,
    @InjectRepository(SaleAgreement)
    private readonly agreementsRepository: Repository<SaleAgreement>,
    @InjectRepository(SaleReceipt)
    private readonly receiptsRepository: Repository<SaleReceipt>,
    @InjectRepository(Buyer)
    private readonly buyersRepository: Repository<Buyer>,
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createFolder(
    dto: CreateSaleFolderDto,
    user: UserContext,
    executionKey?: string,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId!,
        executionKey,
        'sale.folder.create',
        { ...dto },
        async () => {
          const repository = manager.getRepository(SaleFolder);
          const folder = repository.create({
            companyId: user.companyId,
            name: dto.name,
            description: dto.description,
          });

          return repository.save(folder);
        },
      ),
    );
  }

  async listFolders(user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    return this.foldersRepository.find({
      where: { companyId: user.companyId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async createAgreement(
    dto: CreateSaleAgreementDto,
    user: UserContext,
    executionKey?: string,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId!,
        executionKey,
        'sale.agreement.create',
        { ...dto },
        async () => {
          const folder = await manager.getRepository(SaleFolder).findOne({
            where: {
              id: dto.folderId,
              companyId: user.companyId,
              deletedAt: IsNull(),
            },
          });

          if (!folder) {
            throw new NotFoundException('Folder not found');
          }

          const buyer = await this.resolveAgreementBuyer(
            dto,
            user.companyId!,
            manager,
          );
          const property = await manager.getRepository(Property).findOne({
            where: {
              id: dto.propertyId,
              companyId: user.companyId,
              deletedAt: IsNull(),
            },
          });
          if (!property) {
            throw new NotFoundException('Property not found');
          }

          const total = paymentCents(dto.totalAmount, 'Sale total'),
            installment = paymentCents(dto.installmentAmount, 'Installment');
          if (
            total <= 0n ||
            installment <= 0n ||
            !Number.isSafeInteger(dto.installmentCount) ||
            dto.installmentCount < 1 ||
            dto.installmentCount > 2147483647
          )
            throw new BadRequestException(
              'Sale and installments require positive supported amounts',
            );
          if (
            installment * BigInt(dto.installmentCount - 1) >= total ||
            installment * BigInt(dto.installmentCount) < total
          )
            throw new BadRequestException(
              'Installment schedule must cover the sale price with a positive final installment',
            );
          if (
            !['ARS', 'USD', 'BRL'].includes(dto.currency ?? 'ARS') ||
            !Number.isInteger(dto.dueDay ?? 10) ||
            (dto.dueDay ?? 10) < 1 ||
            (dto.dueDay ?? 10) > 31
          )
            throw new BadRequestException(
              'Unsupported sale currency or due day',
            );
          if (Number.isNaN(this.parseDateOnly(dto.startDate).getTime()))
            throw new BadRequestException('Invalid sale start date');
          const contract = manager.getRepository(Lease).create({
            companyId: user.companyId,
            propertyId: property.id,
            ownerId: property.ownerId,
            buyerId: buyer.id,
            tenantId: null,
            contractType: ContractType.SALE,
            status: LeaseStatus.DRAFT,
            signatureStatus: ContractSignatureStatus.NOT_STARTED,
            fiscalValue: dto.totalAmount,
            monthlyRent: null,
            startDate: null,
            endDate: null,
            currency: dto.currency || 'ARS',
          });
          const savedContract = await manager
            .getRepository(Lease)
            .save(contract);
          const agreement = manager.getRepository(SaleAgreement).create({
            companyId: user.companyId,
            folderId: dto.folderId,
            contractId: savedContract.id,
            propertyId: property.id,
            buyerId: buyer.id,
            buyerName: `${buyer.user.firstName} ${buyer.user.lastName}`.trim(),
            buyerPhone: buyer.user.phone ?? '',
            totalAmount: dto.totalAmount,
            currency: dto.currency || 'ARS',
            installmentAmount: dto.installmentAmount,
            installmentCount: dto.installmentCount,
            startDate: dto.startDate,
            dueDay: dto.dueDay ?? 10,
            notes: dto.notes,
          });

          return manager.getRepository(SaleAgreement).save(agreement);
        },
      ),
    );
  }

  async listAgreements(user: UserContext, folderId?: string) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const query = this.agreementsRepository
      .createQueryBuilder('agreement')
      .leftJoinAndSelect('agreement.folder', 'folder')
      .leftJoinAndSelect('agreement.buyer', 'buyer')
      .leftJoinAndSelect('buyer.user', 'buyerUser')
      .leftJoinAndSelect('agreement.contract', 'contract')
      .leftJoinAndSelect('agreement.property', 'property')
      .where('agreement.company_id = :companyId', { companyId: user.companyId })
      .andWhere('agreement.deleted_at IS NULL');

    if (this.isBuyerOnly(user))
      query.andWhere('buyer.user_id = :buyerUserId', { buyerUserId: user.id });

    if (folderId) {
      query.andWhere('agreement.folder_id = :folderId', { folderId });
    }

    return query
      .orderBy('agreement.createdAt', 'DESC')
      .addOrderBy('agreement.id', 'DESC')
      .getMany();
  }

  async pageAgreements(
    user: UserContext,
    filters: {
      folderId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    if (!user.companyId)
      throw new BadRequestException('Company scope required');
    const { page = 1, limit = 20, search, folderId } = filters;
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid pagination');
    const query = this.agreementsRepository
      .createQueryBuilder('agreement')
      .leftJoinAndSelect('agreement.folder', 'folder')
      .leftJoinAndSelect('agreement.buyer', 'buyer')
      .leftJoinAndSelect('buyer.user', 'buyerUser')
      .leftJoinAndSelect('agreement.property', 'property')
      .leftJoinAndSelect('agreement.contract', 'contract')
      .where('agreement.company_id=:companyId', { companyId: user.companyId })
      .andWhere('agreement.deleted_at IS NULL');
    if (this.isBuyerOnly(user))
      query.andWhere('buyer.user_id=:buyerUserId', { buyerUserId: user.id });
    if (folderId) query.andWhere('agreement.folder_id=:folderId', { folderId });
    if (search?.trim())
      query.andWhere(
        "(agreement.buyer_name ILIKE :search OR concat_ws(' ',buyerUser.first_name,buyerUser.last_name) ILIKE :search OR concat_ws(' ',property.name,property.address_street,property.address_city) ILIKE :search)",
        { search: `%${search.trim()}%` },
      );
    const [data, total] = await query
      .orderBy('agreement.createdAt', 'DESC')
      .addOrderBy('agreement.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, total, page, limit };
  }

  async getAgreement(id: string, user: UserContext) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const agreement = await this.agreementsRepository.findOne({
      where: { id, companyId: user.companyId, deletedAt: IsNull() },
      relations: [
        'folder',
        'receipts',
        'buyer',
        'buyer.user',
        'contract',
        'property',
      ],
    });

    if (!agreement) {
      throw new NotFoundException('Agreement not found');
    }

    this.assertBuyerScope(agreement, user);
    return agreement;
  }

  async listReceipts(agreementId: string, user: UserContext) {
    await this.getAgreement(agreementId, user);

    return this.receiptsRepository.find({
      where: { agreementId },
      order: { createdAt: 'DESC' },
    });
  }

  async createReceipt(
    agreementId: string,
    dto: CreateSaleReceiptDto,
    user: UserContext,
    executionKey?: string,
  ) {
    if (!user.companyId) {
      throw new BadRequestException('Company scope required');
    }

    const paymentDate = this.parseDateOnly(dto.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Invalid payment date');
    }

    const amount = paymentCents(dto.amount, 'Receipt amount');
    if (amount <= 0n)
      throw new BadRequestException('Receipt amount must be positive');
    const savedReceipt = await this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId!,
        executionKey,
        'sale.receipt.create',
        { agreementId, ...dto },
        async () => {
          const agreementRepository = manager.getRepository(SaleAgreement);
          const receiptRepository = manager.getRepository(SaleReceipt);
          const agreement = await agreementRepository.findOne({
            where: {
              id: agreementId,
              companyId: user.companyId,
              deletedAt: IsNull(),
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!agreement) {
            throw new NotFoundException('Agreement not found');
          }

          const previousPaid = paymentCents(
            agreement.paidAmount,
            'Previously paid',
          );
          const total = paymentCents(agreement.totalAmount, 'Sale total');
          const paidAmount = previousPaid + amount;
          if (paidAmount > 99999999999999n)
            throw new BadRequestException(
              'Accumulated payments exceed supported capacity',
            );
          const installmentAmount = paymentCents(
            agreement.installmentAmount,
            'Installment',
          );
          if (
            installmentAmount <= 0n ||
            !Number.isSafeInteger(agreement.installmentCount) ||
            agreement.installmentCount < 1
          )
            throw new BadRequestException(
              'Sale schedule requires review before accepting payments',
            );
          const installmentNumber =
            dto.installmentNumber ??
            Math.min(
              agreement.installmentCount,
              Number(previousPaid / installmentAmount) + 1,
            );
          if (
            !Number.isInteger(installmentNumber) ||
            installmentNumber < 1 ||
            installmentNumber > agreement.installmentCount
          )
            throw new BadRequestException(
              'Installment number is outside the sale schedule',
            );
          const balanceAfter = total - paidAmount;
          const expectedPaid = this.calculateExpectedPaid(
            agreement,
            paymentDate,
          );
          const overdueAmount =
            expectedPaid > previousPaid ? expectedPaid - previousPaid : 0n;

          agreement.paidAmount = paymentNumber(paidAmount);
          await agreementRepository.save(agreement);

          const receiptNumber = await this.generateReceiptNumber(
            agreementId,
            manager,
          );
          const receipt = receiptRepository.create({
            agreementId,
            receiptNumber,
            installmentNumber,
            amount: dto.amount,
            currency: agreement.currency,
            paymentDate,
            balanceAfter: paymentNumber(balanceAfter),
            overdueAmount: paymentNumber(overdueAmount),
            copyCount: 2,
            financialSnapshot: {
              version: 1,
              agreement: {
                buyerName: agreement.buyerName,
                buyerPhone: agreement.buyerPhone,
                currency: agreement.currency,
                totalAmount: String(agreement.totalAmount),
                installmentAmount: String(agreement.installmentAmount),
                installmentCount: agreement.installmentCount,
                startDate: agreement.startDate,
                dueDay: agreement.dueDay,
              },
              receipt: {
                receiptNumber,
                installmentNumber,
                amount: dto.amount,
                currency: agreement.currency,
                paymentDate: paymentDate.toISOString().slice(0, 10),
                balanceAfter: paymentNumber(balanceAfter),
                overdueAmount: paymentNumber(overdueAmount),
                copyCount: 2,
              },
            },
          });
          const saved = await receiptRepository.save(receipt);
          await manager.query(
            `INSERT INTO sale_receipt_effects_outbox (company_id, receipt_id)
         VALUES ($1::uuid, $2::uuid) ON CONFLICT (receipt_id) DO NOTHING`,
            [user.companyId, saved.id],
          );
          return saved;
        },
      ),
    );

    return savedReceipt;
  }

  async getReceipt(receiptId: string, user: UserContext) {
    if (!user.companyId)
      throw new BadRequestException('Company scope required');
    const receipt = await this.receiptsRepository.findOne({
      where: { id: receiptId },
      relations: ['agreement', 'agreement.folder', 'agreement.buyer'],
    });

    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }

    if (receipt.agreement?.companyId !== user.companyId) {
      throw new ForbiddenException('You can only access your own company');
    }

    this.assertBuyerScope(receipt.agreement, user);
    return receipt;
  }

  async cancelReceipt(
    receiptId: string,
    dto: CancelSaleReceiptDto,
    user: UserContext,
    executionKey?: string,
  ) {
    if (!user.companyId)
      throw new BadRequestException('Company scope required');
    if (this.isBuyerOnly(user))
      throw new ForbiddenException('Buyers cannot cancel receipts');
    if (dto.reason.trim().length < 5)
      throw new BadRequestException('Cancellation requires a reason');
    if (!executionKey)
      throw new BadRequestException(
        'Idempotency-Key is required for receipt cancellation',
      );
    return this.dataSource.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        user.companyId!,
        executionKey,
        'sale.receipt.cancel',
        { receiptId, ...dto },
        async () => {
          const receipts = manager.getRepository(SaleReceipt);
          const source = await receipts.findOne({ where: { id: receiptId } });
          if (!source) throw new NotFoundException('Receipt not found');
          const agreements = manager.getRepository(SaleAgreement);
          const agreement = await agreements.findOne({
            where: {
              id: source.agreementId,
              companyId: user.companyId,
              deletedAt: IsNull(),
            },
            lock: { mode: 'pessimistic_write' },
          });
          if (!agreement) throw new NotFoundException('Agreement not found');
          const receipt = await receipts.findOne({
            where: { id: receiptId, agreementId: agreement.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!receipt) throw new NotFoundException('Receipt not found');
          if (receipt.cancelledAt) return receipt;
          const previous = paymentCents(agreement.paidAmount),
            amount = paymentCents(receipt.amount);
          if (amount <= 0n || amount > previous)
            throw new BadRequestException(
              'Receipt cancellation requires accounting review',
            );
          const resulting = previous - amount;
          agreement.paidAmount = paymentNumber(resulting);
          await agreements.save(agreement);
          await manager.query(
            `INSERT INTO sale_receipt_cancellations
          (company_id,agreement_id,receipt_id,cancelled_by,reason,amount,currency,previous_paid,resulting_paid)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              user.companyId,
              agreement.id,
              receipt.id,
              user.id ?? null,
              dto.reason,
              paymentNumber(amount),
              receipt.currency,
              paymentNumber(previous),
              paymentNumber(resulting),
            ],
          );
          receipt.cancelledAt = new Date();
          receipt.cancelledBy = user.id ?? null;
          receipt.cancellationReason = dto.reason;
          return receipts.save(receipt);
        },
      ),
    );
  }

  async getSchedule(
    agreementId: string,
    user: UserContext,
    page = 1,
    limit = 20,
    asOf?: string,
  ) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new BadRequestException('Invalid schedule pagination');
    const agreement = await this.getAgreement(agreementId, user);
    const today =
      asOf ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date());
    const date = this.parseDateOnly(today);
    const start = this.parseDateOnly(agreement.startDate);
    const installment = paymentCents(agreement.installmentAmount),
      total = paymentCents(agreement.totalAmount),
      paid = paymentCents(agreement.paidAmount);
    if (
      !Number.isFinite(date.getTime()) ||
      !Number.isFinite(start.getTime()) ||
      installment <= 0n ||
      !Number.isSafeInteger(agreement.installmentCount) ||
      agreement.installmentCount < 1 ||
      installment * BigInt(agreement.installmentCount - 1) >= total ||
      installment * BigInt(agreement.installmentCount) < total
    )
      throw new BadRequestException('Sale schedule requires review');
    const installments = [];
    for (
      let index = (page - 1) * limit;
      index < Math.min(page * limit, agreement.installmentCount);
      index++
    ) {
      installments.push(
        this.installmentView(
          agreement,
          index,
          start,
          date,
          installment,
          total,
          paid,
        ),
      );
    }
    const expected = this.calculateExpectedPaid(agreement, date);
    return {
      data: installments,
      total: agreement.installmentCount,
      page,
      limit,
      asOf: today,
      currency: agreement.currency,
      totalAmount: paymentNumber(total),
      paidAmount: paymentNumber(paid),
      balance: paymentNumber(total - paid),
      credit: paymentNumber(paid > total ? paid - total : 0n),
      overdueAmount: paymentNumber(expected > paid ? expected - paid : 0n),
    };
  }

  private installmentView(
    agreement: SaleAgreement,
    index: number,
    start: Date,
    date: Date,
    installment: bigint,
    total: bigint,
    paid: bigint,
  ) {
    const month = start.getUTCMonth() + index;
    const lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), month + 1, 0),
    ).getUTCDate();
    let due = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        month,
        Math.min(agreement.dueDay || 10, lastDay),
      ),
    );
    if (index === 0 && due < start) due = start;
    const before = installment * BigInt(index),
      remaining = total - before;
    const amount = remaining < installment ? remaining : installment;
    let allocated = 0n;
    if (paid > before)
      allocated = paid - before < amount ? paid - before : amount;
    const balance = amount - allocated;
    return {
      installmentNumber: index + 1,
      dueDate: due.toISOString().slice(0, 10),
      amount: paymentNumber(amount),
      paidAmount: paymentNumber(allocated),
      balance: paymentNumber(balance),
      status: this.installmentStatus(balance, due, date, allocated),
      currency: agreement.currency,
    };
  }

  private installmentStatus(
    balance: bigint,
    due: Date,
    date: Date,
    paid: bigint,
  ) {
    if (balance === 0n) return 'paid';
    if (due < date) return 'overdue';
    if (paid > 0n) return 'partial';
    return 'pending';
  }

  private isBuyerOnly(user: UserContext) {
    const actor = { ...user, role: user.role ?? UserRole.STAFF };
    return hasRole(actor, UserRole.BUYER) && !isAdminOrStaff(actor);
  }

  private assertBuyerScope(agreement: SaleAgreement, user: UserContext) {
    if (
      this.isBuyerOnly(user) &&
      (!user.id || agreement.buyer?.userId !== user.id)
    )
      throw new ForbiddenException(
        'Sale does not belong to your buyer account',
      );
  }

  private async generateReceiptNumber(
    agreementId: string,
    manager: import('typeorm').EntityManager,
  ): Promise<string> {
    await manager.query(
      `INSERT INTO sale_receipt_number_counters(agreement_id,last_number)
        SELECT $1, COALESCE(MAX(substring(receipt_number FROM '-([0-9]+)$')::numeric),0)
        FROM sale_receipts WHERE agreement_id=$1 ON CONFLICT(agreement_id) DO NOTHING`,
      [agreementId],
    );
    const [counter] = await manager.query(
      `WITH advanced AS (UPDATE sale_receipt_number_counters SET last_number=last_number+1
        WHERE agreement_id=$1 AND last_number<2147483647 RETURNING last_number) SELECT * FROM advanced`,
      [agreementId],
    );
    if (!counter)
      throw new BadRequestException('Receipt numbering capacity exceeded');
    return `SREC-${agreementId.replaceAll('-', '')}-${String(counter.last_number).padStart(4, '0')}`;
  }

  private calculateExpectedPaid(agreement: SaleAgreement, paymentDate: Date) {
    const start = this.parseDateOnly(agreement.startDate);
    const dueDay = agreement.dueDay || 10;

    const monthsDiff =
      paymentDate.getUTCFullYear() * 12 +
      paymentDate.getUTCMonth() -
      (start.getUTCFullYear() * 12 + start.getUTCMonth());

    let installmentsDue = monthsDiff;
    const lastDay = new Date(
      Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (
      paymentDate >= start &&
      paymentDate.getUTCDate() >= Math.min(dueDay, lastDay)
    ) {
      installmentsDue += 1;
    }

    installmentsDue = Math.max(
      0,
      Math.min(installmentsDue, agreement.installmentCount),
    );

    const expected =
      paymentCents(agreement.installmentAmount, 'Installment') *
      BigInt(installmentsDue);
    const total = paymentCents(agreement.totalAmount, 'Sale total');
    return expected > total ? total : expected;
  }

  private parseDateOnly(value: string | Date) {
    const day =
      value instanceof Date ? value.toISOString().slice(0, 10) : value;
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))
      return new Date(Number.NaN);
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === day
      ? date
      : new Date(Number.NaN);
  }

  private async resolveAgreementBuyer(
    dto: CreateSaleAgreementDto,
    companyId: string,
    manager?: import('typeorm').EntityManager,
  ): Promise<Buyer> {
    const buyer = await (
      manager?.getRepository(Buyer) ?? this.buyersRepository
    ).findOne({
      where: { id: dto.buyerId, companyId, deletedAt: IsNull() },
      relations: ['user'],
    });

    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    return buyer;
  }
}
