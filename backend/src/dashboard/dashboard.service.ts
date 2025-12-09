import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Property } from '../properties/entities/property.entity';
import { Lease, LeaseStatus } from '../leases/entities/lease.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { BillingJob } from '../payments/entities/billing-job.entity';
import {
  CommissionInvoice,
  CommissionInvoiceStatus,
} from '../payments/entities/commission-invoice.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentActivityDto } from './dto/recent-activity.dto';

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
      .innerJoin('lease.unit', 'unit')
      .innerJoin('unit.property', 'property')
      .leftJoinAndSelect('lease.currency', 'currency')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('lease.status = :status', { status: LeaseStatus.ACTIVE })
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
      .innerJoin('lease.unit', 'unit')
      .innerJoin('unit.property', 'property')
      .where('property.company_id = :companyId', { companyId })
      .andWhere('payment.deleted_at IS NULL')
      .getCount();

    // Count invoices for the company (through leases)
    const totalInvoices = await this.invoicesRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.lease', 'lease')
      .innerJoin('lease.unit', 'unit')
      .innerJoin('unit.property', 'property')
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

  /**
   * Get recent batch job activity.
   * @param limit - Number of items to return (10, 25, or 50)
   * @returns Recent activity items with totals
   */
  async getRecentActivity(limit: number = 10): Promise<RecentActivityDto> {
    // Validate limit
    const validLimits = [10, 25, 50];
    const effectiveLimit = validLimits.includes(limit) ? limit : 10;

    const [jobs, total] = await this.billingJobRepository.findAndCount({
      order: { startedAt: 'DESC' },
      take: effectiveLimit,
    });

    return {
      items: jobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        recordsTotal: job.recordsTotal,
        recordsProcessed: job.recordsProcessed,
        recordsFailed: job.recordsFailed,
        recordsSkipped: job.recordsSkipped,
        dryRun: job.dryRun,
      })),
      total,
      limit: effectiveLimit,
    };
  }
}
