import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Settlement, SettlementStatus } from './entities/settlement.entity';
import { SettlementFiltersDto } from './dto/settlement-filters.dto';
import { UserRole } from '../users/entities/user.entity';
import { Owner } from '../owners/entities/owner.entity';

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
}

export interface SettlementSummary {
  totalPending: number;
  totalCompleted: number;
  lastSettlementDate: string | null;
  pendingCount: number;
  completedCount: number;
}

const EMPTY_SETTLEMENT_SUMMARY: SettlementSummary = {
  totalPending: 0,
  totalCompleted: 0,
  lastSettlementDate: null,
  pendingCount: 0,
  completedCount: 0,
};

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementsRepository: Repository<Settlement>,
    @InjectRepository(Owner)
    private readonly ownersRepository: Repository<Owner>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async resolveOwnerIdForUser(
    user: UserContext,
  ): Promise<string | null> {
    if (user.role !== UserRole.OWNER) return null;
    const owner = await this.ownersRepository.findOne({
      where: { userId: user.id, companyId: user.companyId },
    });
    return owner?.id ?? null;
  }

  async findAll(
    companyId: string,
    filters: SettlementFiltersDto,
    user: UserContext,
  ): Promise<Settlement[]> {
    let ownerIdFilter = filters.ownerId;

    if (user.role === UserRole.OWNER) {
      const ownerId = await this.resolveOwnerIdForUser(user);
      if (!ownerId) return [];
      ownerIdFilter = ownerId;
    }

    const params: Array<string> = [companyId];
    const conditions: string[] = [
      `owner_entity.company_id = $1`,
      `owner_entity.deleted_at IS NULL`,
    ];

    if (ownerIdFilter) {
      params.push(ownerIdFilter);
      conditions.push(`s.owner_id = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`s.status = $${params.length}`);
    }

    if (filters.periodStart) {
      params.push(filters.periodStart);
      conditions.push(`s.period >= $${params.length}`);
    }

    if (filters.periodEnd) {
      params.push(filters.periodEnd);
      conditions.push(`s.period <= $${params.length}`);
    }

    const rows = await this.dataSource.query<Settlement[]>(
      `SELECT
           s.id,
           s.company_id AS "companyId",
           s.owner_id AS "ownerId",
           s.period,
           s.gross_amount AS "grossAmount",
           s.commission_rate AS "commissionRate",
           s.commission_amount AS "commissionAmount",
           s.net_amount AS "netAmount",
           s.status,
           s.scheduled_date AS "scheduledDate",
           s.processed_at AS "processedAt",
           s.transfer_reference AS "transferReference",
           s.notes,
           s.receipt_pdf_url AS "receiptPdfUrl",
           s.receipt_name AS "receiptName",
           s.currency_code AS "currencyCode",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY COALESCE(s.processed_at, s.scheduled_date, s.created_at) DESC`,
      params,
    );

    return rows;
  }

  async findOne(
    id: string,
    companyId: string,
    user: UserContext,
  ): Promise<Settlement> {
    const ownerId = await this.resolveOwnerIdForUser(user);
    if (user.role === UserRole.OWNER && !ownerId) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    const params = ownerId ? [companyId, id, ownerId] : [companyId, id];
    const ownerCondition = ownerId ? 'AND s.owner_id = $3' : '';
    const rows = await this.dataSource.query<Settlement[]>(
      `SELECT
           s.id,
           s.company_id AS "companyId",
           s.owner_id AS "ownerId",
           s.period,
           s.gross_amount AS "grossAmount",
           s.commission_rate AS "commissionRate",
           s.commission_amount AS "commissionAmount",
           s.net_amount AS "netAmount",
           s.status,
           s.scheduled_date AS "scheduledDate",
           s.processed_at AS "processedAt",
           s.transfer_reference AS "transferReference",
           s.notes,
           s.receipt_pdf_url AS "receiptPdfUrl",
           s.receipt_name AS "receiptName",
           s.currency_code AS "currencyCode",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
          AND owner_entity.company_id = $1
          AND owner_entity.deleted_at IS NULL
         WHERE s.id = $2
           ${ownerCondition}`,
      params,
    );

    const settlement = rows[0];
    if (!settlement) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }
    return settlement;
  }

  async getSummary(
    companyId: string,
    user: UserContext,
    ownerId?: string,
  ): Promise<SettlementSummary> {
    let ownerIdFilter = ownerId;

    if (user.role === UserRole.OWNER) {
      const resolvedId = await this.resolveOwnerIdForUser(user);
      if (!resolvedId) return { ...EMPTY_SETTLEMENT_SUMMARY };
      ownerIdFilter = resolvedId;
    }

    const params: Array<string> = [companyId];
    const conditions: string[] = [
      `owner_entity.company_id = $1`,
      `owner_entity.deleted_at IS NULL`,
    ];

    if (ownerIdFilter) {
      params.push(ownerIdFilter);
      conditions.push(`s.owner_id = $${params.length}`);
    }

    const rows = await this.dataSource.query<
      {
        status: SettlementStatus;
        total_net: string;
        count: string;
        last_date: string | null;
      }[]
    >(
      `SELECT
          s.status,
          SUM(s.net_amount)::text AS total_net,
          COUNT(*)::text AS count,
          MAX(COALESCE(s.processed_at, s.scheduled_date, s.created_at))::text AS last_date
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY s.status`,
      params,
    );

    let totalPending = 0;
    let totalCompleted = 0;
    let pendingCount = 0;
    let completedCount = 0;
    let lastSettlementDate: string | null = null;

    for (const row of rows) {
      if (
        row.status === SettlementStatus.PENDING ||
        row.status === SettlementStatus.PROCESSING
      ) {
        totalPending += Number(row.total_net);
        pendingCount += Number(row.count);
      } else if (row.status === SettlementStatus.COMPLETED) {
        totalCompleted += Number(row.total_net);
        completedCount += Number(row.count);
        if (
          row.last_date &&
          (!lastSettlementDate || row.last_date > lastSettlementDate)
        ) {
          lastSettlementDate = row.last_date;
        }
      }
    }

    return {
      totalPending,
      totalCompleted,
      lastSettlementDate,
      pendingCount,
      completedCount,
    };
  }
}
