import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import { AiToolExecutorService } from './ai-tool-executor.service';

type PendingActionRow = {
  id: string;
  company_id: string;
  requested_by: string;
  tool_name: string;
  payload: unknown;
  status: string;
};

@Injectable()
export class PendingActionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly executor: AiToolExecutorService,
  ) {}

  async list(companyId: string) {
    return this.dataSource.query(
      `SELECT pa.id, pa.tool_name AS "toolName", pa.action_type AS "actionType",
              pa.entity_type AS "entityType", pa.summary, pa.payload, pa.status,
              pa.result, pa.error_message AS "errorMessage",
              pa.created_at AS "createdAt", pa.reviewed_at AS "reviewedAt",
              concat_ws(' ', u.first_name, u.last_name) AS "requestedByName"
         FROM pending_actions pa
         JOIN users u ON u.id = pa.requested_by
        WHERE pa.company_id = $1::uuid
        ORDER BY CASE WHEN pa.status = 'pending' THEN 0 ELSE 1 END,
                 pa.created_at DESC
        LIMIT 200`,
      [companyId],
    );
  }

  async approve(
    id: string,
    reviewer: { id: string; companyId: string; role: UserRole },
  ) {
    const action = await this.findOne(id, reviewer.companyId);
    if (action.status !== 'pending') {
      throw new BadRequestException('Pending action was already reviewed');
    }
    await this.dataSource.query(
      `UPDATE pending_actions SET status = 'approved', reviewed_by = $2::uuid,
              reviewed_at = now(), updated_at = now()
        WHERE id = $1::uuid AND status = 'pending'`,
      [id, reviewer.id],
    );
    try {
      const result = await this.executor.executeApproved(
        action.tool_name,
        action.payload,
        {
          userId: reviewer.id,
          companyId: reviewer.companyId,
          role: reviewer.role,
        },
      );
      await this.dataSource.query(
        `UPDATE pending_actions SET status = 'executed', result = $2::jsonb,
                updated_at = now() WHERE id = $1::uuid`,
        [id, JSON.stringify(result ?? null)],
      );
    } catch (error) {
      await this.dataSource.query(
        `UPDATE pending_actions SET status = 'failed', error_message = $2,
                updated_at = now() WHERE id = $1::uuid`,
        [id, error instanceof Error ? error.message : String(error)],
      );
    }
    return this.findOne(id, reviewer.companyId);
  }

  async reject(
    id: string,
    reviewer: { id: string; companyId: string },
    reason?: string,
  ) {
    const result = await this.dataSource.query(
      `UPDATE pending_actions SET status = 'rejected', reviewed_by = $3::uuid,
              reviewed_at = now(), error_message = $4, updated_at = now()
        WHERE id = $1::uuid AND company_id = $2::uuid AND status = 'pending'
        RETURNING id`,
      [id, reviewer.companyId, reviewer.id, reason?.trim() || null],
    );
    if (!result[0])
      throw new BadRequestException('Pending action was already reviewed');
    return this.findOne(id, reviewer.companyId);
  }

  private async findOne(
    id: string,
    companyId: string,
  ): Promise<PendingActionRow> {
    const rows = (await this.dataSource.query(
      `SELECT * FROM pending_actions WHERE id = $1::uuid AND company_id = $2::uuid`,
      [id, companyId],
    )) as PendingActionRow[];
    if (!rows[0]) throw new NotFoundException('Pending action not found');
    return rows[0];
  }
}
