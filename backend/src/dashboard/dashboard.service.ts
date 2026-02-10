import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import {
  ContractType,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { BillingJob } from '../payments/entities/billing-job.entity';
import {
  CommissionInvoice,
  CommissionInvoiceStatus,
} from '../payments/entities/commission-invoice.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import {
  PersonActivityItemDto,
  RecentActivityDto,
} from './dto/recent-activity.dto';
import {
  InterestedActivity,
  InterestedActivityStatus,
} from '../interested/entities/interested-activity.entity';
import { InterestedProfile } from '../interested/entities/interested-profile.entity';
import {
  OwnerActivity,
  OwnerActivityStatus,
} from '../owners/entities/owner-activity.entity';
import { Owner } from '../owners/entities/owner.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Property)
    private readonly propertiesRepository: Repository<Property>,
    @InjectRepository(Lease)
    private readonly leasesRepository: Repository<Lease>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private readonly invoicesRepository: Repository<Invoice>,
    @InjectRepository(BillingJob)
    private readonly billingJobRepository: Repository<BillingJob>,
    @InjectRepository(CommissionInvoice)
    private readonly commissionInvoiceRepository: Repository<CommissionInvoice>,
    @InjectRepository(InterestedActivity)
    private readonly interestedActivityRepository: Repository<InterestedActivity>,
    @InjectRepository(InterestedProfile)
    private readonly interestedProfilesRepository: Repository<InterestedProfile>,
    @InjectRepository(OwnerActivity)
    private readonly ownerActivityRepository: Repository<OwnerActivity>,
    @InjectRepository(Owner)
    private readonly ownerRepository: Repository<Owner>,
  ) {}

  async getStats(companyId: string): Promise<DashboardStatsDto> {
    // Count properties for the company
    const totalProperties = await this.propertiesRepository.count({
      where: { companyId, deletedAt: IsNull() },
    });

    // Count tenants for the company
    const totalTenants = await this.usersRepository.count({
      where: {
        companyId,
        role: UserRole.TENANT,
        deletedAt: IsNull(),
      },
    });

    // Count active leases and calculate monthly income
    const activeLeasesList = await this.leasesRepository
      .createQueryBuilder('lease')
      .innerJoin('lease.property', 'property')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('lease.contract_type = :contractType', {
        contractType: ContractType.RENTAL,
      })
      .andWhere('lease.deleted_at IS NULL')
      .getMany();

    const activeLeases = activeLeasesList.length;

    // Calculate monthly income (sum of rent amounts from active leases)
    const monthlyIncome = activeLeasesList.reduce((sum, lease) => {
      return sum + Number(lease.monthlyRent);
    }, 0);

    // Get the most common currency or default to ARS
    const currencyCode =
      activeLeasesList.length > 0
        ? activeLeasesList[0].currency || 'ARS'
        : 'ARS';

    // Count payments for the company (through tenant accounts linked to leases)
    const totalPayments = await this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.tenantAccount', 'tenantAccount')
      .innerJoin('tenantAccount.lease', 'lease')
      .innerJoin('lease.property', 'property')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('payment.deleted_at IS NULL')
      .getCount();

    // Count invoices for the company (through leases)
    const totalInvoices = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.lease', 'lease')
      .innerJoin('lease.property', 'property')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('invoice.deleted_at IS NULL')
      .getCount();

    // Calculate paid commissions for the current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const commissionResult = await this.commissionInvoiceRepository
      .createQueryBuilder('ci')
      .select('COALESCE(SUM(ci.commission_amount), 0)', 'total')
      .where('ci.company_id = :companyId', { companyId })
      .andWhere('ci.status = :status', { status: CommissionInvoiceStatus.PAID })
      .andWhere('ci.paid_at >= :startDate', { startDate: firstDayOfMonth })
      .andWhere('ci.paid_at <= :endDate', { endDate: lastDayOfMonth })
      .andWhere('ci.deleted_at IS NULL')
      .getRawOne();

    const monthlyCommissions = Number(commissionResult?.total ?? 0);

    return {
      totalProperties,
      totalTenants,
      activeLeases,
      monthlyIncome,
      currencyCode,
      totalPayments,
      totalInvoices,
      monthlyCommissions,
    };
  }

  async getRecentActivity(
    companyId: string,
    limit: number = 25,
  ): Promise<RecentActivityDto> {
    const validLimits = [10, 25, 50];
    const effectiveLimit = validLimits.includes(limit) ? limit : 25;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const [interestedOverdue, interestedToday, ownerOverdue, ownerToday] =
      await Promise.all([
        this.interestedActivityRepository
          .createQueryBuilder('activity')
          .innerJoin(
            InterestedProfile,
            'profile',
            'profile.id = activity.interested_profile_id',
          )
          .where('profile.company_id = :companyId', { companyId })
          .andWhere('profile.deleted_at IS NULL')
          .andWhere('activity.status = :status', {
            status: InterestedActivityStatus.PENDING,
          })
          .andWhere('activity.completed_at IS NULL')
          .andWhere('activity.due_at IS NOT NULL')
          .andWhere('activity.due_at < :startOfToday', { startOfToday })
          .orderBy('activity.due_at', 'ASC')
          .addOrderBy('activity.created_at', 'ASC')
          .take(effectiveLimit)
          .select([
            'activity.id AS id',
            `'interested' AS source_type`,
            `'interested' AS person_type`,
            'profile.id AS person_id',
            "COALESCE(NULLIF(TRIM(profile.first_name || ' ' || profile.last_name), ''), profile.phone) AS person_name",
            'activity.subject AS subject',
            'activity.body AS body',
            'activity.status AS status',
            'activity.due_at AS due_at',
            'activity.completed_at AS completed_at',
            'NULL::uuid AS property_id',
            'NULL::text AS property_name',
            'activity.created_at AS created_at',
            'activity.updated_at AS updated_at',
          ])
          .getRawMany(),
        this.interestedActivityRepository
          .createQueryBuilder('activity')
          .innerJoin(
            InterestedProfile,
            'profile',
            'profile.id = activity.interested_profile_id',
          )
          .where('profile.company_id = :companyId', { companyId })
          .andWhere('profile.deleted_at IS NULL')
          .andWhere('activity.status = :status', {
            status: InterestedActivityStatus.PENDING,
          })
          .andWhere('activity.completed_at IS NULL')
          .andWhere('activity.due_at >= :startOfToday', { startOfToday })
          .andWhere('activity.due_at < :startOfTomorrow', { startOfTomorrow })
          .orderBy('activity.due_at', 'ASC')
          .addOrderBy('activity.created_at', 'ASC')
          .take(effectiveLimit)
          .select([
            'activity.id AS id',
            `'interested' AS source_type`,
            `'interested' AS person_type`,
            'profile.id AS person_id',
            "COALESCE(NULLIF(TRIM(profile.first_name || ' ' || profile.last_name), ''), profile.phone) AS person_name",
            'activity.subject AS subject',
            'activity.body AS body',
            'activity.status AS status',
            'activity.due_at AS due_at',
            'activity.completed_at AS completed_at',
            'NULL::uuid AS property_id',
            'NULL::text AS property_name',
            'activity.created_at AS created_at',
            'activity.updated_at AS updated_at',
          ])
          .getRawMany(),
        this.ownerActivityRepository
          .createQueryBuilder('activity')
          .innerJoin(Owner, 'owner', 'owner.id = activity.owner_id')
          .innerJoin(User, 'ownerUser', 'ownerUser.id = owner.user_id')
          .leftJoin(Property, 'property', 'property.id = activity.property_id')
          .where('activity.company_id = :companyId', { companyId })
          .andWhere('activity.deleted_at IS NULL')
          .andWhere('activity.status = :status', {
            status: OwnerActivityStatus.PENDING,
          })
          .andWhere('activity.completed_at IS NULL')
          .andWhere('activity.due_at IS NOT NULL')
          .andWhere('activity.due_at < :startOfToday', { startOfToday })
          .orderBy('activity.due_at', 'ASC')
          .addOrderBy('activity.created_at', 'ASC')
          .take(effectiveLimit)
          .select([
            'activity.id AS id',
            `'owner' AS source_type`,
            `'owner' AS person_type`,
            'owner.id AS person_id',
            "COALESCE(NULLIF(TRIM(ownerUser.first_name || ' ' || ownerUser.last_name), ''), ownerUser.email) AS person_name",
            'activity.subject AS subject',
            'activity.body AS body',
            'activity.status AS status',
            'activity.due_at AS due_at',
            'activity.completed_at AS completed_at',
            'activity.property_id AS property_id',
            'property.name AS property_name',
            'activity.created_at AS created_at',
            'activity.updated_at AS updated_at',
          ])
          .getRawMany(),
        this.ownerActivityRepository
          .createQueryBuilder('activity')
          .innerJoin(Owner, 'owner', 'owner.id = activity.owner_id')
          .innerJoin(User, 'ownerUser', 'ownerUser.id = owner.user_id')
          .leftJoin(Property, 'property', 'property.id = activity.property_id')
          .where('activity.company_id = :companyId', { companyId })
          .andWhere('activity.deleted_at IS NULL')
          .andWhere('activity.status = :status', {
            status: OwnerActivityStatus.PENDING,
          })
          .andWhere('activity.completed_at IS NULL')
          .andWhere('activity.due_at >= :startOfToday', { startOfToday })
          .andWhere('activity.due_at < :startOfTomorrow', { startOfTomorrow })
          .orderBy('activity.due_at', 'ASC')
          .addOrderBy('activity.created_at', 'ASC')
          .take(effectiveLimit)
          .select([
            'activity.id AS id',
            `'owner' AS source_type`,
            `'owner' AS person_type`,
            'owner.id AS person_id',
            "COALESCE(NULLIF(TRIM(ownerUser.first_name || ' ' || ownerUser.last_name), ''), ownerUser.email) AS person_name",
            'activity.subject AS subject',
            'activity.body AS body',
            'activity.status AS status',
            'activity.due_at AS due_at',
            'activity.completed_at AS completed_at',
            'activity.property_id AS property_id',
            'property.name AS property_name',
            'activity.created_at AS created_at',
            'activity.updated_at AS updated_at',
          ])
          .getRawMany(),
      ]);

    const mapRow = (row: any): PersonActivityItemDto => ({
      id: row.id,
      sourceType: row.source_type,
      personType: row.person_type,
      personId: row.person_id,
      personName: row.person_name,
      subject: row.subject,
      body: row.body,
      status: row.status,
      dueAt: row.due_at ? new Date(row.due_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      propertyId: row.property_id,
      propertyName: row.property_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });

    const overdue = [...interestedOverdue, ...ownerOverdue]
      .map(mapRow)
      .sort((a, b) => {
        const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      })
      .slice(0, effectiveLimit);

    const today = [...interestedToday, ...ownerToday]
      .map(mapRow)
      .sort((a, b) => {
        const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      })
      .slice(0, effectiveLimit);

    return {
      overdue,
      today,
      total: overdue.length + today.length,
    };
  }
}
