import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Settlement } from './entities/settlement.entity';
import {
  SettlementFiltersDto,
  SettlementSummaryFiltersDto,
} from './dto/settlement-filters.dto';
import {
  SettlementStatusTotalDto,
  SettlementSummaryDto,
} from './dto/settlement-summary.dto';
import { UserRole } from '../users/entities/user.entity';
import { Owner } from '../owners/entities/owner.entity';
import { hasRole, isAdminOrStaff } from '../common/helpers/role-scope.helper';

interface UserContext {
  id: string;
  companyId: string;
  role: UserRole;
  roles?: UserRole[];
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

  private assertCompany(companyId: string, user: UserContext): void {
    if (!companyId || companyId !== user.companyId)
      throw new BadRequestException('Company scope required');
  }

  private async resolveOwnerIdForUser(
    user: UserContext,
  ): Promise<string | null> {
    if (!hasRole(user, UserRole.OWNER) || isAdminOrStaff(user)) return null;
    const owner = await this.ownersRepository.findOne({
      where: { userId: user.id, companyId: user.companyId },
    });
    return owner?.id ?? null;
  }

  private async buildScope(
    companyId: string,
    user: UserContext,
    filters: SettlementSummaryFiltersDto,
  ) {
    this.assertCompany(companyId, user);
    if (
      filters.periodStart &&
      filters.periodEnd &&
      filters.periodStart > filters.periodEnd
    )
      throw new BadRequestException('periodStart must not exceed periodEnd');
    let ownerId = filters.ownerId;
    if (hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user)) {
      const own = await this.resolveOwnerIdForUser(user);
      if (!own) return null;
      ownerId = own;
    }
    const params: Array<string | number> = [companyId];
    const conditions = [
      'owner_entity.company_id = $1',
      'owner_entity.deleted_at IS NULL',
    ];
    for (const [column, operator, value] of [
      ['s.owner_id', '=', ownerId],
      ['s.status', '=', filters.status],
      ['s.currency', '=', filters.currency],
      ['s.period', '>=', filters.periodStart],
      ['s.period', '<=', filters.periodEnd],
    ]) {
      if (value) {
        params.push(value);
        conditions.push(`${column} ${operator} $${params.length}`);
      }
    }
    return { params, conditions };
  }

  async findAll(
    companyId: string,
    filters: SettlementFiltersDto,
    user: UserContext,
  ): Promise<Settlement[]> {
    const scope = await this.buildScope(companyId, user, filters);
    if (!scope) return [];
    const { params, conditions } = scope;
    const limit =
      filters.limit === undefined ? '' : `LIMIT $${params.push(filters.limit)}`;

    const rows = await this.dataSource.query<Settlement[]>(
      `SELECT
           s.id,
           owner_entity.company_id AS "companyId",
           s.owner_id AS "ownerId",
           s.period,
           s.gross_amount AS "grossAmount",
           CASE WHEN s.gross_amount = 0 THEN NULL
             ELSE ROUND(s.commission_amount * 100 / s.gross_amount, 2) END AS "commissionRate",
           s.commission_amount AS "commissionAmount",
           s.withholdings_amount AS "withholdingsAmount",
           s.net_amount AS "netAmount",
           s.status,
           s.scheduled_date AS "scheduledDate",
           s.processed_at AS "processedAt",
           s.transfer_reference AS "transferReference",
           s.notes,
           COALESCE((SELECT SUM(c.net_amount) FROM settlement_source_compensations c WHERE c.company_id=$1 AND c.settlement_id=s.id),0) AS "compensationAmount",
           receipt.file_url AS "receiptPdfUrl",
           receipt.name AS "receiptName",
           s.currency AS "currencyCode",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
         LEFT JOIN LATERAL (
           SELECT d.file_url, d.name FROM documents d
           LEFT JOIN settlement_payout_movements pm ON pm.document_id=d.id AND pm.company_id=d.company_id
           WHERE d.company_id = $1 AND d.entity_type = 'owner_settlement'
             AND d.entity_id = s.id AND d.deleted_at IS NULL AND d.status='approved'
           ORDER BY COALESCE(pm.provider_updated_at,d.created_at) DESC, d.id DESC LIMIT 1
         ) receipt ON TRUE
         WHERE ${conditions.join(' AND ')}
         ORDER BY COALESCE(s.processed_at, s.scheduled_date, s.created_at) DESC, s.id DESC ${limit}`,
      params,
    );

    return rows;
  }

  async findOne(
    id: string,
    companyId: string,
    user: UserContext,
  ): Promise<Settlement> {
    this.assertCompany(companyId, user);
    const ownerId = await this.resolveOwnerIdForUser(user);
    if (hasRole(user, UserRole.OWNER) && !isAdminOrStaff(user) && !ownerId) {
      throw new NotFoundException(`Settlement ${id} not found`);
    }

    const params = ownerId ? [companyId, id, ownerId] : [companyId, id];
    const ownerCondition = ownerId ? 'AND s.owner_id = $3' : '';
    const rows = await this.dataSource.query<Settlement[]>(
      `SELECT
           s.id,
           owner_entity.company_id AS "companyId",
           s.owner_id AS "ownerId",
           s.period,
           s.gross_amount AS "grossAmount",
           CASE WHEN s.gross_amount = 0 THEN NULL
             ELSE ROUND(s.commission_amount * 100 / s.gross_amount, 2) END AS "commissionRate",
           s.commission_amount AS "commissionAmount",
           s.withholdings_amount AS "withholdingsAmount",
           s.net_amount AS "netAmount",
           s.status,
           s.scheduled_date AS "scheduledDate",
           s.processed_at AS "processedAt",
           s.transfer_reference AS "transferReference",
           s.notes,
           COALESCE((SELECT SUM(c.net_amount) FROM settlement_source_compensations c WHERE c.company_id=$1 AND c.settlement_id=s.id),0) AS "compensationAmount",
           receipt.file_url AS "receiptPdfUrl",
           receipt.name AS "receiptName",
           s.currency AS "currencyCode",
           s.created_at AS "createdAt",
           s.updated_at AS "updatedAt"
         FROM settlements s
         INNER JOIN owners owner_entity
           ON owner_entity.id = s.owner_id
          AND owner_entity.company_id = $1
          AND owner_entity.deleted_at IS NULL
         LEFT JOIN LATERAL (
           SELECT d.file_url, d.name FROM documents d
           LEFT JOIN settlement_payout_movements pm ON pm.document_id=d.id AND pm.company_id=d.company_id
           WHERE d.company_id = $1 AND d.entity_type = 'owner_settlement'
             AND d.entity_id = s.id AND d.deleted_at IS NULL AND d.status='approved'
           ORDER BY COALESCE(pm.provider_updated_at,d.created_at) DESC, d.id DESC LIMIT 1
         ) receipt ON TRUE
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
    filters: SettlementSummaryFiltersDto = {},
  ): Promise<SettlementSummaryDto> {
    const scope = await this.buildScope(companyId, user, filters);
    if (!scope) return { totals: [] };
    const totals = await this.dataSource.query<SettlementStatusTotalDto[]>(
      `SELECT s.currency AS "currencyCode", s.status,
          SUM(s.net_amount)::text AS "netAmount", COUNT(*)::int AS count,
          MAX(s.processed_at) AS "lastProcessedAt"
         FROM settlements s
         JOIN owners owner_entity ON owner_entity.id=s.owner_id
         WHERE ${scope.conditions.join(' AND ')}
         GROUP BY s.currency, s.status ORDER BY s.currency, s.status`,
      scope.params,
    );
    return { totals };
  }
}
