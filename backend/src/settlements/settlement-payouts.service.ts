import { enqueuePayoutReceipt } from './settlement-payout-effects.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  MercadoPagoPayoutsClient,
  PayoutRequest,
  PayoutTransaction,
} from '../integrations/mercadopago-payouts.client';
import { ProviderConfigService } from '../integrations/provider-config.service';
import { ProviderRequestError } from '../integrations/provider-http.service';
import {
  RequestSettlementPayoutDto,
  ReviewSettlementPayoutDto,
  SettlementPayoutOverviewDto,
} from './dto/settlement-payout.dto';

type SettlementRow = {
  id: string;
  owner_id: string;
  net_amount: string;
  currency: string;
  status: string;
  transfer_reference: string | null;
};
type Job = {
  id: string;
  company_id: string;
  settlement_id: string;
  owner_id: string;
  request: PayoutRequest;
  status: string;
  payout_id: string | null;
  transaction_id: string | null;
  remote_status: string | null;
  remote_detail: string | null;
  remote_updated_at: Date | null;
  claim_token: string;
  failures: number;
  attempts: number;
  error_code: string | null;
};
@Injectable()
export class SettlementPayoutsService {
  private readonly logger = new Logger(SettlementPayoutsService.name);
  constructor(
    private readonly db: DataSource,
    private readonly client: MercadoPagoPayoutsClient,
    private readonly config: ProviderConfigService,
  ) {}
  private scope(companyId: string) {
    if (!companyId) throw new BadRequestException('Company scope required');
  }
  private async settlement(
    manager: EntityManager,
    id: string,
    companyId: string,
    lock = false,
  ): Promise<SettlementRow> {
    this.scope(companyId);
    const [row] = await manager.query(
      `SELECT s.* FROM settlements s JOIN owners o ON o.id=s.owner_id AND o.company_id=$2::uuid AND o.deleted_at IS NULL WHERE s.id=$1::uuid ${lock ? 'FOR UPDATE OF s' : ''}`,
      [id, companyId],
    );
    if (!row) throw new NotFoundException('Settlement not found');
    return row;
  }
  async request(
    settlementId: string,
    companyId: string,
    actorId: string,
    dto: RequestSettlementPayoutDto,
  ): Promise<SettlementPayoutOverviewDto> {
    this.config.assertEnabled('MERCADOPAGO_PAYOUTS');
    this.scope(companyId);
    if (dto.confirmed !== true)
      throw new BadRequestException('Explicit payout confirmation required');
    await this.db.transaction(async (manager) => {
      const settlement = await this.settlement(
        manager,
        settlementId,
        companyId,
        true,
      );
      const [existing]: Job[] = await manager.query(
        'SELECT * FROM settlement_payout_outbox WHERE settlement_id=$1::uuid AND company_id=$2::uuid',
        [settlementId, companyId],
      );
      const id = existing?.id ?? randomUUID();
      const data = this.client.validate({
        idempotencyKey: id,
        externalReference: `rent_settlement_${settlementId}`,
        amount: dto.expectedAmount,
        currency: dto.currency,
        ...(dto.recipientEmail !== undefined
          ? { recipientEmail: dto.recipientEmail }
          : {}),
        ...(dto.bankAccount !== undefined
          ? { bankAccount: dto.bankAccount }
          : {}),
      });
      if (existing) {
        if (!isDeepStrictEqual(existing.request, data))
          throw new ConflictException(
            'This settlement already has a different payout request',
          );
        return;
      }
      if (settlement.status !== 'pending' || settlement.transfer_reference)
        throw new ConflictException(
          'Only unpaid pending settlements can be transferred',
        );
      if (
        settlement.currency !== data.currency ||
        settlement.net_amount !== data.amount
      )
        throw new ConflictException('Settlement amount or currency changed');
      await manager.query(
        `INSERT INTO settlement_payout_outbox(id,company_id,settlement_id,owner_id,requested_by,request) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb)`,
        [
          id,
          companyId,
          settlementId,
          settlement.owner_id,
          actorId,
          JSON.stringify(data),
        ],
      );
      await manager.query(
        "UPDATE settlements SET status='processing',updated_at=now() WHERE id=$1::uuid",
        [settlementId],
      );
    });
    return this.overview(settlementId, companyId);
  }
  async overview(
    settlementId: string,
    companyId: string,
  ): Promise<SettlementPayoutOverviewDto> {
    await this.settlement(this.db.manager, settlementId, companyId);
    const [job] = await this.db.query(
      `SELECT id,status,payout_id AS "payoutId",transaction_id AS "transactionId",request->>'amount' AS amount,request->>'currency' AS currency,remote_status AS "remoteStatus",remote_detail AS "remoteDetail",error_code AS "errorCode",attempts,updated_at AS "updatedAt" FROM settlement_payout_outbox WHERE settlement_id=$1::uuid AND company_id=$2::uuid`,
      [settlementId, companyId],
    );
    const movements = await this.db.query(
      `SELECT m.id,m.kind,m.amount::text,m.currency,(m.document_id IS NOT NULL) AS "receiptAvailable",e.status AS "receiptStatus",m.transaction_id AS "transactionId",m.provider_updated_at AS "providerUpdatedAt",m.created_at AS "createdAt" FROM settlement_payout_movements m LEFT JOIN settlement_payout_effects_outbox e ON e.movement_id=m.id AND e.company_id=m.company_id WHERE m.settlement_id=$1::uuid AND m.company_id=$2::uuid ORDER BY m.created_at,m.id`,
      [settlementId, companyId],
    );
    const reviews = job
      ? await this.db.query(
          `SELECT id,actor_id AS "actorId",action,reason,created_at AS "createdAt" FROM settlement_payout_reviews WHERE payout_job_id=$1::uuid AND company_id=$2::uuid ORDER BY created_at DESC,id DESC LIMIT 50`,
          [job.id, companyId],
        )
      : [];
    return {
      enabled: this.config.enabled('MERCADOPAGO_PAYOUTS'),
      job: job ?? null,
      movements,
      reviews,
    };
  }
  async review(
    settlementId: string,
    companyId: string,
    actorId: string,
    dto: ReviewSettlementPayoutDto,
  ) {
    this.config.assertEnabled('MERCADOPAGO_PAYOUTS');
    await this.settlement(this.db.manager, settlementId, companyId);
    if (dto.confirmed !== true || dto.reason.trim().length < 10)
      throw new BadRequestException('Confirmation and review reason required');
    let verified: PayoutTransaction | undefined;
    if (dto.action === 'link') {
      const [job]: Job[] = await this.db.query(
        'SELECT * FROM settlement_payout_outbox WHERE settlement_id=$1::uuid AND company_id=$2::uuid',
        [settlementId, companyId],
      );
      if (
        !job ||
        job.status !== 'needs_review' ||
        job.payout_id ||
        !dto.payoutId ||
        !dto.transactionId
      )
        throw new ConflictException('Only an uncertain creation can be linked');
      verified = await this.client.transaction(
        companyId,
        dto.payoutId,
        dto.transactionId,
        job.request,
      );
    }
    await this.db.transaction(async (manager) => {
      const [job]: Job[] = await manager.query(
        `SELECT * FROM settlement_payout_outbox WHERE settlement_id=$1::uuid AND company_id=$2::uuid AND (lease_expires_at IS NULL OR lease_expires_at<now()) FOR UPDATE`,
        [settlementId, companyId],
      );
      if (!job)
        throw new ConflictException(
          'Payout is missing or currently processing',
        );
      await this.settlement(manager, settlementId, companyId, true);
      if (dto.action === 'link') {
        if (job.status !== 'needs_review' || job.payout_id || !verified)
          throw new ConflictException('Payout was already resolved');
        try {
          await manager.query(
            `UPDATE settlement_payout_outbox SET payout_id=$2,transaction_id=$3,status='awaiting',error_code=NULL,failures=0,next_attempt_at=now(),claim_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1::uuid`,
            [job.id, dto.payoutId, dto.transactionId],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new ConflictException(
              'External transaction is already linked',
            );
          throw error;
        }
      } else if (dto.action === 'retry') {
        if (
          job.status !== 'failed' ||
          job.payout_id ||
          !['provider_rejected', 'configuration_error'].includes(
            job.error_code ?? '',
          )
        )
          throw new ConflictException(
            'Uncertain transfers must never be sent again',
          );
        const settlement = await this.settlement(
          manager,
          settlementId,
          companyId,
          true,
        );
        this.assertSnapshot(job, settlement);
        if (settlement.status !== 'failed')
          throw new ConflictException(
            'Settlement is no longer eligible for retry',
          );
        await manager.query(
          `UPDATE settlement_payout_outbox SET status='queued',error_code=NULL,failures=0,next_attempt_at=now(),claim_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1::uuid`,
          [job.id],
        );
        await manager.query(
          "UPDATE settlements SET status='processing',updated_at=now() WHERE id=$1::uuid",
          [settlementId],
        );
      } else if (dto.action === 'refresh') {
        if (!job.payout_id)
          throw new ConflictException(
            'A known transaction is required for reconciliation',
          );
        await manager.query(
          `UPDATE settlement_payout_outbox SET status='awaiting',error_code=NULL,failures=0,next_attempt_at=now(),claim_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1::uuid`,
          [job.id],
        );
      } else throw new BadRequestException('Unsupported payout review action');
      await manager.query(
        `INSERT INTO settlement_payout_reviews(company_id,payout_job_id,actor_id,action,reason,payout_id,transaction_id) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)`,
        [
          companyId,
          job.id,
          actorId,
          dto.action,
          dto.reason.trim(),
          dto.action === 'link' ? dto.payoutId : job.payout_id,
          dto.action === 'link' ? dto.transactionId : job.transaction_id,
        ],
      );
    });
    return this.overview(settlementId, companyId);
  }
  async processDue() {
    const counts = {
      processed: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      disabled: !this.config.enabled('MERCADOPAGO_PAYOUTS'),
    };
    if (counts.disabled) return counts;
    for (let index = 0; index < 25; index++) {
      const [job]: Job[] = await this.db.query(
        `WITH next AS (SELECT id FROM settlement_payout_outbox WHERE status IN ('queued','dispatching','awaiting','completed') AND next_attempt_at<=now() AND (lease_expires_at IS NULL OR lease_expires_at<now()) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED), claimed AS (UPDATE settlement_payout_outbox j SET claim_token=$1::uuid,lease_expires_at=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() FROM next WHERE j.id=next.id RETURNING j.*) SELECT * FROM claimed`,
        [randomUUID()],
      );
      if (!job) break;
      counts.processed++;
      try {
        if (await this.execute(job)) counts.completed++;
        const [result] = await this.db.query(
          'SELECT status FROM settlement_payout_outbox WHERE id=$1::uuid',
          [job.id],
        );
        if (result?.status === 'needs_review') counts.deadLetter++;
        else if (result?.status === 'failed') counts.failed++;
      } catch (error) {
        counts.failed++;
        if (await this.fail(job, error)) counts.deadLetter++;
      }
    }
    this.logger.log(
      JSON.stringify({ event: 'settlement_payouts_processed', ...counts }),
    );
    return counts;
  }
  private async claimed(
    manager: EntityManager,
    job: Job,
  ): Promise<Job | undefined> {
    const [current]: Job[] = await manager.query(
      `SELECT * FROM settlement_payout_outbox WHERE id=$1::uuid AND claim_token=$2::uuid AND lease_expires_at>now() FOR UPDATE`,
      [job.id, job.claim_token],
    );
    return current;
  }
  private assertSnapshot(job: Job, settlement: SettlementRow) {
    if (
      settlement.owner_id !== job.owner_id ||
      settlement.net_amount !== job.request.amount ||
      settlement.currency !== job.request.currency
    )
      throw new ConflictException('Settlement no longer matches its payout');
  }
  private async execute(job: Job): Promise<boolean> {
    this.config.assertEnabled('MERCADOPAGO_PAYOUTS');
    let current = await this.db.transaction(async (manager) => {
      const claimed = await this.claimed(manager, job);
      if (!claimed) return undefined;
      const settlement = await this.settlement(
        manager,
        claimed.settlement_id,
        claimed.company_id,
        true,
      );
      this.assertSnapshot(claimed, settlement);
      if (!claimed.payout_id) {
        if (claimed.status !== 'queued')
          throw new ConflictException('An earlier transfer may already exist');
        if (settlement.status !== 'processing')
          throw new ConflictException('Settlement is no longer eligible');
        this.client.validate(claimed.request);
        await manager.query(
          `UPDATE settlement_payout_outbox SET status='dispatching',updated_at=now() WHERE id=$1::uuid`,
          [claimed.id],
        );
      }
      return claimed;
    });
    if (!current) return false;
    if (!current.payout_id) {
      const remote = await this.client.create(
        current.company_id,
        current.request,
      );
      current = await this.db.transaction(async (manager) => {
        const claimed = await this.claimed(manager, job);
        if (!claimed) return undefined;
        await manager.query(
          `UPDATE settlement_payout_outbox SET payout_id=$2,transaction_id=$3,status='awaiting',error_code=NULL,updated_at=now() WHERE id=$1::uuid`,
          [job.id, remote.id, remote.transactions[0].id],
        );
        return {
          ...claimed,
          payout_id: remote.id,
          transaction_id: remote.transactions[0].id,
          status: 'awaiting',
        };
      });
      if (!current) return false;
    }
    const remote = await this.client.transaction(
      current.company_id,
      current.payout_id!,
      current.transaction_id!,
      current.request,
    );
    return this.reconcile(job, remote);
  }
  private async reconcile(
    job: Job,
    remote: PayoutTransaction,
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const current = await this.claimed(manager, job);
      if (!current) return false;
      const settlement = await this.settlement(
        manager,
        current.settlement_id,
        current.company_id,
        true,
      );
      this.assertSnapshot(current, settlement);
      const observedAt = new Date(remote.last_update_date);
      if (!Number.isFinite(observedAt.getTime()))
        throw new Error('Invalid provider timestamp');
      const [ledger] = await manager.query(
        `SELECT count(*) FILTER (WHERE kind='transfer')::int AS transfers,count(*) FILTER (WHERE kind='reversal')::int AS reversals FROM settlement_payout_movements WHERE payout_job_id=$1::uuid`,
        [job.id],
      );
      const oldTime = current.remote_updated_at
        ? new Date(current.remote_updated_at).getTime()
        : 0;
      if (observedAt.getTime() < oldTime) {
        await this.finish(
          manager,
          current,
          current.status === 'completed' ? 'completed' : 'awaiting',
          null,
          false,
        );
        return false;
      }
      if (
        observedAt.getTime() === oldTime &&
        (remote.status !== current.remote_status ||
          (remote.status_detail ?? null) !== current.remote_detail)
      ) {
        await this.finish(
          manager,
          current,
          'needs_review',
          'conflicting_provider_status',
          false,
        );
        return false;
      }
      const accredited = this.client.isAccredited(remote);
      const refunded =
        remote.status === 'refunded' && remote.status_detail === 'refunded';
      let status = 'awaiting';
      let error: string | null = null;
      let completed = false;
      if (accredited) {
        if (
          ledger.reversals ||
          (current.remote_status === 'refunded' &&
            current.remote_detail === 'refunded')
        ) {
          status = 'needs_review';
          error = 'accreditation_after_reversal';
        } else if (!ledger.transfers && settlement.status !== 'processing') {
          status = 'needs_review';
          error = 'unexpected_settlement_status';
        } else {
          if (!ledger.transfers) {
            await this.movement(manager, current, 'transfer', observedAt);
            completed = true;
          }
          await manager.query(
            `UPDATE settlements SET status='completed',processed_at=COALESCE(processed_at,$2::timestamptz),transfer_reference=$3,updated_at=now() WHERE id=$1::uuid`,
            [
              current.settlement_id,
              observedAt.toISOString(),
              current.transaction_id,
            ],
          );
          status = 'completed';
        }
      } else if (refunded) {
        if (ledger.transfers && !ledger.reversals)
          await this.movement(manager, current, 'reversal', observedAt);
        await manager.query(
          `UPDATE settlements SET status='failed',processed_at=NULL,transfer_reference=$2,updated_at=now() WHERE id=$1::uuid`,
          [current.settlement_id, current.transaction_id],
        );
        status = 'reversed';
      } else if (remote.status_detail === 'partially_refunded') {
        status = 'needs_review';
        error = 'partial_refund_requires_review';
        await this.blockQueuedPaidNotices(
          manager,
          current,
          'Partial refund requires review',
        );
        await manager.query(
          "UPDATE settlements SET status='processing',updated_at=now() WHERE id=$1::uuid",
          [current.settlement_id],
        );
      } else if (ledger.transfers || ledger.reversals) {
        status = 'needs_review';
        error = 'status_changed_after_accreditation';
        await this.blockQueuedPaidNotices(
          manager,
          current,
          'Provider status requires review',
        );
      } else if (['rejected', 'canceled', 'error'].includes(remote.status)) {
        status = 'failed';
        error = 'transfer_not_accredited';
        await manager.query(
          "UPDATE settlements SET status='failed',updated_at=now() WHERE id=$1::uuid",
          [current.settlement_id],
        );
      } else if (
        ![
          'created',
          'pending',
          'approved',
          'processed',
          'transaction_in_process',
        ].includes(remote.status) &&
        !(remote.status === 'success' && remote.status_detail === 'in_progress')
      ) {
        status = 'needs_review';
        error = 'unknown_provider_status';
      }
      await manager.query(
        `UPDATE settlement_payout_outbox SET remote_status=$2,remote_detail=$3,remote_updated_at=$4::timestamptz WHERE id=$1::uuid`,
        [
          job.id,
          remote.status,
          remote.status_detail ?? null,
          observedAt.toISOString(),
        ],
      );
      await this.finish(manager, current, status, error, true);
      return completed;
    });
  }
  private async movement(
    manager: EntityManager,
    job: Job,
    kind: string,
    observedAt: Date,
  ) {
    const [movement] = await manager.query(
      `WITH inserted AS (INSERT INTO settlement_payout_movements(company_id,settlement_id,payout_job_id,kind,amount,currency,transaction_id,provider_updated_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::numeric,$6,$7,$8::timestamptz) ON CONFLICT(payout_job_id,kind) DO NOTHING RETURNING id) SELECT id FROM inserted`,
      [
        job.company_id,
        job.settlement_id,
        job.id,
        kind,
        job.request.amount,
        job.request.currency,
        job.transaction_id,
        observedAt.toISOString(),
      ],
    );
    if (movement) await enqueuePayoutReceipt(manager, movement.id);
    if (kind === 'reversal')
      await this.blockQueuedPaidNotices(
        manager,
        job,
        'Settlement transfer reversed',
      );
  }
  private async blockQueuedPaidNotices(
    manager: EntityManager,
    job: Job,
    reason: string,
  ) {
    await manager.query(
      `UPDATE communication_deliveries SET status='blocked',next_attempt_at=NULL,error_message=$3,updated_at=now()
       WHERE company_id=$1::uuid AND metadata->>'settlementId'=$2 AND metadata->>'payoutMovementKind'='transfer'
       AND status IN ('queued','pending_approval','failed')`,
      [job.company_id, job.settlement_id, reason],
    );
  }

  private async finish(
    manager: EntityManager,
    job: Job,
    status: string,
    error: string | null,
    resetFailures: boolean,
  ) {
    await manager.query(
      `UPDATE settlement_payout_outbox SET status=$2,error_code=$3,failures=CASE WHEN $4 THEN 0 ELSE failures END,next_attempt_at=now()+CASE WHEN $2='completed' THEN interval '1 day' ELSE interval '5 minutes' END,claim_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1::uuid`,
      [job.id, status, error, resetFailures],
    );
  }
  private async fail(job: Job, error: unknown): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const current = await this.claimed(manager, job);
      if (!current) return false;
      let status = 'needs_review';
      let code = 'reconciliation_required';
      if (current.payout_id) {
        if (
          !(error instanceof ConflictException) &&
          !(error instanceof NotFoundException) &&
          current.failures < 4
        ) {
          status = 'awaiting';
          code = 'provider_read_failed';
        }
      } else if (
        current.status === 'queued' ||
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        status = 'failed';
        code = 'configuration_error';
      } else if (
        error instanceof ProviderRequestError &&
        !error.outcomeUnknown &&
        [400, 401, 403, 422].includes(error.status ?? 0)
      ) {
        status = 'failed';
        code = 'provider_rejected';
      } else code = 'create_outcome_unknown';
      await manager.query(
        'UPDATE settlement_payout_outbox SET failures=failures+1 WHERE id=$1::uuid',
        [job.id],
      );
      if (status === 'failed')
        await manager.query(
          "UPDATE settlements SET status='failed',updated_at=now() WHERE id=$1::uuid AND status='processing'",
          [current.settlement_id],
        );
      await this.finish(manager, current, status, code, false);
      this.logger.warn(
        JSON.stringify({ event: 'settlement_payout_failed', id: job.id, code }),
      );
      return status === 'needs_review';
    });
  }
}
