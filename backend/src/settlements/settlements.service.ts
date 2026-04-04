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
      ownerIdFilter = ownerId ?? undefined;
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
      `SELECT s.*
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY COALESCE(s.processed_at, s.scheduled_date, s.created_at) DESC`,
      params,
    );

    return rows;
  }

  async findOne(id: string, companyId: string): Promise<Settlement> {
    const rows = await this.dataSource.query<Settlement[]>(
      `SELECT s.*
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
          AND owner_entity.company_id = $1
          AND owner_entity.deleted_at IS NULL
         WHERE s.id = $2`,
      [companyId, id],
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
      ownerIdFilter = resolvedId ?? undefined;
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
