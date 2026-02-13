import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import {
  ContractType,
  Lease,
  LeaseStatus,
} from '../leases/entities/lease.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import {
  BillingJob,
  BillingJobType,
} from '../payments/entities/billing-job.entity';
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
  BatchReportType,
  ReportJobItemDto,
  ReportJobsDto,
} from './dto/report-jobs.dto';
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

type RequestUser = {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
};

type ActivityRow = {
  id: string;
  source_type: 'interested' | 'owner';
  person_type: 'interested' | 'owner';
  person_id: string;
  person_name: string;
  subject: string;
  body: string | null;
  status: InterestedActivityStatus | OwnerActivityStatus;
  due_at: string | Date | null;
  completed_at: string | Date | null;
  property_id: string | null;
  property_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type ReportJobRow = {
  id: string;
  status: string;
  records_total: string | number;
  records_processed: string | number;
  records_failed: string | number;
  dry_run: boolean;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  error_message: string | null;
  error_log: Record<string, unknown>[] | null;
  owner_id: string;
  owner_name: string;
  report_type: string | null;
  report_month: string | null;
};

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getStats(
    companyId: string,
    user: RequestUser,
  ): Promise<DashboardStatsDto> {
    const isPrivileged = this.isPrivilegedUser(user.role);

    const propertiesQuery = this.buildScopedPropertiesQuery(companyId, user);

    const totalPropertiesResult = await propertiesQuery
      .select('COUNT(DISTINCT property.id)', 'total')
      .getRawOne<{ total: string }>();
    const totalProperties = Number(totalPropertiesResult?.total ?? 0);

    const tenantsCountQuery = this.leasesRepository
      .createQueryBuilder('lease')
      .innerJoin('lease.tenant', 'tenant')
      .innerJoin('tenant.user', 'tenantUser')
      .innerJoin('lease.property', 'property')
      .innerJoin('property.owner', 'owner')
      .innerJoin('owner.user', 'ownerUser')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('lease.contract_type = :contractType', {
        contractType: ContractType.RENTAL,
      })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('lease.deleted_at IS NULL');

    this.applyRoleScope(tenantsCountQuery, user, {
      ownerAlias: 'owner',
      ownerUserAlias: 'ownerUser',
      tenantAlias: 'tenant',
      tenantUserAlias: 'tenantUser',
    });

    const totalTenantsResult = await tenantsCountQuery
      .select('COUNT(DISTINCT tenant.id)', 'total')
      .getRawOne<{ total: string }>();
    const totalTenants = Number(totalTenantsResult?.total ?? 0);

    const activeLeasesQuery = this.leasesRepository
      .createQueryBuilder('lease')
      .innerJoinAndSelect('lease.property', 'property')
      .innerJoin('property.owner', 'owner')
      .innerJoin('owner.user', 'ownerUser')
      .innerJoin('lease.tenant', 'tenant')
      .innerJoin('tenant.user', 'tenantUser')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
      .andWhere('lease.contract_type = :contractType', {
        contractType: ContractType.RENTAL,
      })
      .andWhere('lease.deleted_at IS NULL');

    this.applyRoleScope(activeLeasesQuery, user, {
      ownerAlias: 'owner',
      ownerUserAlias: 'ownerUser',
      tenantAlias: 'tenant',
      tenantUserAlias: 'tenantUser',
    });

    const activeLeasesList = await activeLeasesQuery.getMany();
    const activeLeases = activeLeasesList.length;
    const monthlyIncome = activeLeasesList.reduce(
      (sum, lease) => sum + Number(lease.monthlyRent ?? 0),
      0,
    );
    const currencyCode =
      activeLeasesList.length > 0
        ? activeLeasesList[0].currency || 'ARS'
        : 'ARS';

    const paymentsQuery = this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('payment.tenantAccount', 'tenantAccount')
      .innerJoin('tenantAccount.lease', 'lease')
      .innerJoin('lease.property', 'property')
      .innerJoin('property.owner', 'owner')
      .innerJoin('owner.user', 'ownerUser')
      .innerJoin('lease.tenant', 'tenant')
      .innerJoin('tenant.user', 'tenantUser')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('payment.deleted_at IS NULL');

    this.applyRoleScope(paymentsQuery, user, {
      ownerAlias: 'owner',
      ownerUserAlias: 'ownerUser',
      tenantAlias: 'tenant',
      tenantUserAlias: 'tenantUser',
    });

    const totalPayments = await paymentsQuery.getCount();

    const invoicesQuery = this.invoicesRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.lease', 'lease')
      .innerJoin('lease.property', 'property')
      .innerJoin('property.owner', 'owner')
      .innerJoin('owner.user', 'ownerUser')
      .innerJoin('lease.tenant', 'tenant')
      .innerJoin('tenant.user', 'tenantUser')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('invoice.deleted_at IS NULL');

    this.applyRoleScope(invoicesQuery, user, {
      ownerAlias: 'owner',
      ownerUserAlias: 'ownerUser',
      tenantAlias: 'tenant',
      tenantUserAlias: 'tenantUser',
    });

    const totalInvoices = await invoicesQuery.getCount();

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthlyCommissions = await this.getMonthlyCommissions(
      companyId,
      user,
      isPrivileged,
      firstDayOfMonth,
      lastDayOfMonth,
    );

    const monthlyExpenses = await this.getMonthlyExpenses(
      companyId,
      user,
      isPrivileged,
      firstDayOfMonth,
      lastDayOfMonth,
    );

    return {
      totalProperties,
      totalTenants,
      activeLeases,
      monthlyIncome,
      monthlyExpenses,
      currencyCode,
      totalPayments,
      totalInvoices,
      monthlyCommissions,
    };
  }

  private buildScopedPropertiesQuery(
    companyId: string,
    user: RequestUser,
  ): SelectQueryBuilder<Property> {
    const propertiesQuery = this.propertiesRepository
      .createQueryBuilder('property')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('property.deleted_at IS NULL');

    if (user.role === UserRole.OWNER) {
      propertiesQuery
        .innerJoin('property.owner', 'owner')
        .innerJoin('owner.user', 'ownerUser');
      this.applyOwnerScope(propertiesQuery, user, 'owner', 'ownerUser');
      return propertiesQuery;
    }

    if (user.role === UserRole.TENANT) {
      propertiesQuery
        .innerJoin(
          Lease,
          'tenantLease',
          'tenantLease.property_id = property.id AND tenantLease.contract_type = :rentalType AND tenantLease.status = :activeStatus AND tenantLease.deleted_at IS NULL',
          {
            rentalType: ContractType.RENTAL,
            activeStatus: LeaseStatus.ACTIVE,
          },
        )
        .innerJoin('tenantLease.tenant', 'tenant')
        .innerJoin('tenant.user', 'tenantUser');
      this.applyTenantScope(propertiesQuery, user, 'tenant', 'tenantUser');
    }

    return propertiesQuery;
  }

  private async getMonthlyCommissions(
    companyId: string,
    user: RequestUser,
    isPrivileged: boolean,
    firstDayOfMonth: Date,
    lastDayOfMonth: Date,
  ): Promise<number> {
    if (!isPrivileged && user.role !== UserRole.OWNER) {
      return 0;
    }

    const commissionQuery = this.commissionInvoiceRepository
      .createQueryBuilder('ci')
      .innerJoin('ci.owner', 'owner')
      .innerJoin('owner.user', 'ownerUser')
      .select('COALESCE(SUM(ci.commission_amount), 0)', 'total')
      .where('ci.company_id = :companyId', { companyId })
      .andWhere('ci.status = :status', {
        status: CommissionInvoiceStatus.PAID,
      })
      .andWhere('ci.paid_at >= :startDate', { startDate: firstDayOfMonth })
      .andWhere('ci.paid_at <= :endDate', { endDate: lastDayOfMonth })
      .andWhere('ci.deleted_at IS NULL');

    if (user.role === UserRole.OWNER) {
      this.applyOwnerScope(commissionQuery, user, 'owner', 'ownerUser');
    }

    const commissionResult = await commissionQuery.getRawOne<{
      total: string;
    }>();
    return Number(commissionResult?.total ?? 0);
  }

  private async getMonthlyExpenses(
    companyId: string,
    user: RequestUser,
    isPrivileged: boolean,
    firstDayOfMonth: Date,
    lastDayOfMonth: Date,
  ): Promise<number> {
    if (!isPrivileged && user.role !== UserRole.OWNER) {
      return 0;
    }

    const params: Array<string | Date> = [
      companyId,
      firstDayOfMonth,
      lastDayOfMonth,
    ];
    const ownerScope =
      user.role === UserRole.OWNER
        ? `AND owner_entity.user_id = $${params.push(user.id)}`
        : '';

    const expensesRows = await this.dataSource.query(
      `SELECT COALESCE(SUM(s.net_amount), 0) AS total
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
          AND owner_entity.company_id = $1
          AND owner_entity.deleted_at IS NULL
        WHERE s.status = 'completed'
          AND s.processed_at >= $2
          AND s.processed_at <= $3
          ${ownerScope}`,
      params,
    );
    return Number(expensesRows?.[0]?.total ?? 0);
  }

  async getRecentActivity(
    companyId: string,
    user: RequestUser,
    limit: number = 25,
  ): Promise<RecentActivityDto> {
    const validLimits = [10, 25, 50];
    const effectiveLimit = validLimits.includes(limit) ? limit : 25;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const isPrivileged = this.isPrivilegedUser(user.role);

    const interestedOverduePromise = isPrivileged
      ? this.interestedActivityRepository
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
            "'interested' AS source_type",
            "'interested' AS person_type",
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
          .getRawMany<ActivityRow>()
      : Promise.resolve<ActivityRow[]>([]);

    const interestedTodayPromise = isPrivileged
      ? this.interestedActivityRepository
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
            "'interested' AS source_type",
            "'interested' AS person_type",
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
          .getRawMany<ActivityRow>()
      : Promise.resolve<ActivityRow[]>([]);

    const ownerOverduePromise = this.buildOwnerActivityQuery(
      companyId,
      user,
      effectiveLimit,
      true,
      startOfToday,
      startOfTomorrow,
    ).getRawMany<ActivityRow>();

    const ownerTodayPromise = this.buildOwnerActivityQuery(
      companyId,
      user,
      effectiveLimit,
      false,
      startOfToday,
      startOfTomorrow,
    ).getRawMany<ActivityRow>();

    const [interestedOverdue, interestedToday, ownerOverdue, ownerToday] =
      await Promise.all([
        interestedOverduePromise,
        interestedTodayPromise,
        ownerOverduePromise,
        ownerTodayPromise,
      ]);

    const mapRow = (row: ActivityRow): PersonActivityItemDto => ({
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

    if (isPrivileged) {
      const pendingApprovals = await this.usersRepository.find({
        where: {
          companyId,
          isActive: false,
        },
        order: { createdAt: 'ASC' },
        take: effectiveLimit,
      });

      const pendingItems = pendingApprovals
        .filter(
          (pendingUser) =>
            (pendingUser.role === UserRole.OWNER ||
              pendingUser.role === UserRole.TENANT) &&
            !pendingUser.deletedAt,
        )
        .map<PersonActivityItemDto>((pendingUser) => ({
          id: `approval-${pendingUser.id}`,
          sourceType: 'owner',
          personType: 'owner',
          personId: pendingUser.id,
          personName:
            `${pendingUser.firstName ?? ''} ${pendingUser.lastName ?? ''}`.trim() ||
            pendingUser.email,
          subject: 'Aprobacion de registro pendiente',
          body: `Rol ${pendingUser.role}. Usuario ${pendingUser.email}`,
          status: OwnerActivityStatus.PENDING,
          dueAt: pendingUser.createdAt,
          completedAt: null,
          propertyId: null,
          propertyName: null,
          createdAt: pendingUser.createdAt,
          updatedAt: pendingUser.updatedAt,
        }));

      for (const item of pendingItems) {
        if (item.createdAt < startOfToday) {
          overdue.push(item);
        } else {
          today.push(item);
        }
      }
    }

    overdue.sort((a, b) => {
      const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return dueA - dueB;
    });

    today.sort((a, b) => {
      const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return dueA - dueB;
    });

    return {
      overdue: overdue.slice(0, effectiveLimit),
      today: today.slice(0, effectiveLimit),
      total: overdue.length + today.length,
    };
  }

  async getReportJobs(
    companyId: string,
    user: RequestUser,
    page: number = 1,
    limit: number = 25,
  ): Promise<ReportJobsDto> {
    const pageNumber = Number.isFinite(page) ? Math.max(1, page) : 1;
    const pageLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, limit))
      : 25;

    const query = this.billingJobRepository
      .createQueryBuilder('job')
      .innerJoin(
        Owner,
        'owner',
        "owner.id::text = (job.parameters ->> 'ownerId') AND owner.deleted_at IS NULL",
      )
      .innerJoin(User, 'ownerUser', 'ownerUser.id = owner.user_id')
      .where('job.job_type = :jobType', { jobType: BillingJobType.REPORTS })
      .andWhere('owner.company_id = :companyId', { companyId })
      .andWhere("(job.parameters ->> 'type') IN (:...reportTypes)", {
        reportTypes: ['monthly', 'monthly_summary', 'settlement'],
      });

    if (user.role === UserRole.OWNER) {
      this.applyOwnerScope(query, user, 'owner', 'ownerUser');
    }

    const total = await query.getCount();

    const rows = await query
      .clone()
      .select([
        'job.id AS id',
        'job.status AS status',
        'job.records_total AS records_total',
        'job.records_processed AS records_processed',
        'job.records_failed AS records_failed',
        'job.dry_run AS dry_run',
        'job.started_at AS started_at',
        'job.completed_at AS completed_at',
        'job.created_at AS created_at',
        'job.error_message AS error_message',
        'job.error_log AS error_log',
        'owner.id AS owner_id',
        "COALESCE(NULLIF(TRIM(ownerUser.first_name || ' ' || ownerUser.last_name), ''), ownerUser.email) AS owner_name",
        "(job.parameters ->> 'type') AS report_type",
        "NULLIF(job.parameters ->> 'month', '') AS report_month",
      ])
      .orderBy('job.created_at', 'DESC')
      .addOrderBy('job.started_at', 'DESC')
      .offset((pageNumber - 1) * pageLimit)
      .limit(pageLimit)
      .getRawMany<ReportJobRow>();

    const data: ReportJobItemDto[] = rows
      .map((row) => {
        const reportType = this.normalizeBatchReportType(row.report_type);
        if (!reportType) {
          return null;
        }

        return {
          id: row.id,
          reportType,
          status: row.status as ReportJobItemDto['status'],
          ownerId: row.owner_id,
          ownerName: row.owner_name,
          period: row.report_month,
          recordsTotal: Number(row.records_total ?? 0),
          recordsProcessed: Number(row.records_processed ?? 0),
          recordsFailed: Number(row.records_failed ?? 0),
          dryRun: Boolean(row.dry_run),
          startedAt: row.started_at ? new Date(row.started_at) : null,
          completedAt: row.completed_at ? new Date(row.completed_at) : null,
          createdAt: new Date(row.created_at),
          errorMessage: row.error_message,
          errorLog: row.error_log ?? [],
        };
      })
      .filter((row): row is ReportJobItemDto => row !== null);

    return {
      data,
      total,
      page: pageNumber,
      limit: pageLimit,
    };
  }

  private buildOwnerActivityQuery(
    companyId: string,
    user: RequestUser,
    limit: number,
    overdue: boolean,
    startOfToday: Date,
    startOfTomorrow: Date,
  ) {
    const query = this.ownerActivityRepository
      .createQueryBuilder('activity')
      .innerJoin(Owner, 'owner', 'owner.id = activity.owner_id')
      .innerJoin(User, 'ownerUser', 'ownerUser.id = owner.user_id')
      .leftJoin(Property, 'property', 'property.id = activity.property_id')
      .where('activity.company_id = :companyId', { companyId })
      .andWhere('activity.deleted_at IS NULL')
      .andWhere('activity.status = :status', {
        status: OwnerActivityStatus.PENDING,
      })
      .andWhere('activity.completed_at IS NULL');

    if (overdue) {
      query
        .andWhere('activity.due_at IS NOT NULL')
        .andWhere('activity.due_at < :startOfToday', { startOfToday });
    } else {
      query
        .andWhere('activity.due_at >= :startOfToday', { startOfToday })
        .andWhere('activity.due_at < :startOfTomorrow', { startOfTomorrow });
    }

    if (user.role === UserRole.OWNER) {
      this.applyOwnerScope(query, user, 'owner', 'ownerUser');
    }

    if (user.role === UserRole.TENANT) {
      query
        .innerJoin(
          Lease,
          'tenantLease',
          'tenantLease.property_id = property.id AND tenantLease.contract_type = :rentalType AND tenantLease.status = :activeStatus AND tenantLease.deleted_at IS NULL',
          {
            rentalType: ContractType.RENTAL,
            activeStatus: LeaseStatus.ACTIVE,
          },
        )
        .innerJoin('tenantLease.tenant', 'tenant')
        .innerJoin('tenant.user', 'tenantUser');
      this.applyTenantScope(query, user, 'tenant', 'tenantUser');
    }

    return query
      .orderBy('activity.due_at', 'ASC')
      .addOrderBy('activity.created_at', 'ASC')
      .take(limit)
      .select([
        'activity.id AS id',
        "'owner' AS source_type",
        "'owner' AS person_type",
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
      ]);
  }

  private isPrivilegedUser(role: UserRole): boolean {
    return role === UserRole.ADMIN || role === UserRole.STAFF;
  }

  private applyRoleScope(
    query: SelectQueryBuilder<{ id: string }>,
    user: RequestUser,
    aliases: {
      ownerAlias: string;
      ownerUserAlias: string;
      tenantAlias: string;
      tenantUserAlias: string;
    },
  ) {
    if (user.role === UserRole.OWNER) {
      this.applyOwnerScope(
        query,
        user,
        aliases.ownerAlias,
        aliases.ownerUserAlias,
      );
      return;
    }

    if (user.role === UserRole.TENANT) {
      this.applyTenantScope(
        query,
        user,
        aliases.tenantAlias,
        aliases.tenantUserAlias,
      );
    }
  }

  private normalizeBatchReportType(
    value: string | null,
  ): BatchReportType | null {
    if (value === 'monthly' || value === 'monthly_summary') {
      return 'monthly_summary';
    }
    if (value === 'settlement') {
      return 'settlement';
    }
    return null;
  }

  private applyOwnerScope(
    query: SelectQueryBuilder<{ id: string }>,
    user: RequestUser,
    ownerAlias: string,
    ownerUserAlias: string,
  ) {
    const email = (user.email ?? '').trim().toLowerCase();
    const phone = (user.phone ?? '').trim();

    query.andWhere(
      `(${ownerAlias}.user_id = :scopeUserId OR LOWER(${ownerUserAlias}.email) = :scopeEmail OR (:scopePhone <> '' AND ${ownerUserAlias}.phone = :scopePhone))`,
      {
        scopeUserId: user.id,
        scopeEmail: email,
        scopePhone: phone,
      },
    );
  }

  private applyTenantScope(
    query: SelectQueryBuilder<{ id: string }>,
    user: RequestUser,
    tenantAlias: string,
    tenantUserAlias: string,
  ) {
    const email = (user.email ?? '').trim().toLowerCase();
    const phone = (user.phone ?? '').trim();

    query.andWhere(
      `(${tenantAlias}.user_id = :scopeUserId OR LOWER(${tenantUserAlias}.email) = :scopeEmail OR (:scopePhone <> '' AND ${tenantUserAlias}.phone = :scopePhone))`,
      {
        scopeUserId: user.id,
        scopeEmail: email,
        scopePhone: phone,
      },
    );
  }
}
