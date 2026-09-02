import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { UserRole } from '../users/entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { AiToolExecutorService } from './ai-tool-executor.service';

type PendingActionRow = {
  id: string;
  company_id: string;
  requested_by: string;
  tool_name: string;
  payload: unknown;
  status: string;
  payload_hash: string;
  execution_key: string;
};

@Injectable()
export class PendingActionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly executor: AiToolExecutorService,
    private readonly authService: AuthService,
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
    reauthToken: string,
  ) {
    this.authService.verifyReauthentication(reauthToken, reviewer);
    await this.dataSource.query(
      `UPDATE pending_actions SET status = 'expired', updated_at = NOW()
        WHERE id = $1::uuid AND company_id = $2::uuid AND status = 'pending'
          AND expires_at <= NOW()`,
      [id, reviewer.companyId],
    );
    const claimed = (await this.dataSource.query(
      `UPDATE pending_actions
          SET status = 'executing', reviewed_by = $3::uuid,
              reviewed_at = NOW(), claimed_at = NOW(), updated_at = NOW()
        WHERE id = $1::uuid AND company_id = $2::uuid AND status = 'pending'
          AND expires_at > NOW() AND requested_by <> $3::uuid
        RETURNING *`,
      [id, reviewer.companyId, reviewer.id],
    )) as PendingActionRow[];
    const action = claimed[0];
    if (!action) {
      throw new BadRequestException(
        'Pending action expired, was already reviewed, or requires another approver',
      );
    }
    if (this.hash(action.payload) !== action.payload_hash) {
      await this.markFailed(id, 'Pending action payload hash mismatch');
      throw new BadRequestException('Pending action integrity check failed');
    }
    try {
      const result = await this.executor.executeApproved(
        action.tool_name,
        action.payload,
        {
          userId: reviewer.id,
          companyId: reviewer.companyId,
          role: reviewer.role,
          idempotencyKey: action.execution_key,
        },
      );
      await this.dataSource.query(
        `UPDATE pending_actions SET status = 'executed', result = $2::jsonb,
                updated_at = now() WHERE id = $1::uuid AND status = 'executing'`,
        [id, JSON.stringify(result ?? null)],
      );
    } catch (error) {
      await this.markFailed(
        id,
        error instanceof Error ? error.message : String(error),
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

  private markFailed(id: string, message: string): Promise<unknown> {
    return this.dataSource.query(
      `UPDATE pending_actions SET status = 'failed', error_message = $2,
              updated_at = NOW()
        WHERE id = $1::uuid AND status = 'executing'`,
      [id, message],
    );
  }

  private hash(value: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify(this.sortValue(value)))
      .digest('hex');
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortValue(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortValue(item)]),
      );
    }
    return value;
  }
}
