import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ProviderConfigService } from '../integrations/provider-config.service';
import { SettlementCalculationService } from './settlement-calculation.service';
import {
  GenerateSettlementDto,
  SettlementGenerationDto,
  SettlementGenerationSnapshotDto,
  VoidSettlementGenerationDto,
  SettlementGenerationOverviewDto,
  SettlementGenerationOverviewQueryDto,
  CancelSettlementGenerationRequestDto,
} from './dto/settlement-generation.dto';

export class SettlementSourceChangedError extends ConflictException {
  constructor() {
    super('Settlement source changed; review and regenerate before transfer');
  }
}

type Generation = {
  id: string;
  state: string;
  snapshot: SettlementGenerationSnapshotDto;
};
@Injectable()
export class SettlementGenerationService {
  constructor(
    private readonly db: DataSource,
    private readonly calculation: SettlementCalculationService,
    private readonly config: ProviderConfigService,
  ) {}

  private async view(
    manager: EntityManager,
    settlementId: string,
    companyId: string,
  ): Promise<SettlementGenerationDto> {
    const [row] = await manager.query<SettlementGenerationDto[]>(
      `SELECT g.id,g.settlement_id AS "settlementId",g.state,g.requested_by AS "requestedBy",
        g.created_at AS "createdAt",g.voided_at AS "voidedAt",g.voided_by AS "voidedBy",g.void_reason AS "voidReason",g.snapshot
       FROM settlement_generations g JOIN owners o ON o.id=g.owner_id AND o.company_id=$2 AND o.deleted_at IS NULL
       WHERE g.settlement_id=$1 AND g.company_id=$2`,
      [settlementId, companyId],
    );
    if (!row) throw new NotFoundException('Settlement generation not found');
    return row;
  }

  get(settlementId: string, companyId: string) {
    return this.view(this.db.manager, settlementId, companyId);
  }

  async overview(
    companyId: string,
    query: SettlementGenerationOverviewQueryDto,
  ): Promise<SettlementGenerationOverviewDto> {
    if (query.settlementId && query.requestKey)
      throw new BadRequestException('Choose a settlement or a request key');
    const [owner] = await this.db.query(
      'SELECT id FROM owners WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL',
      [query.ownerId, companyId],
    );
    if (!owner) throw new NotFoundException('Owner not found');
    const result: SettlementGenerationOverviewDto = {
      enabled: this.config.enabled('MERCADOPAGO_PAYOUTS'),
      canVoid: false,
      requestCancelled: false,
      generation: null,
    };
    if (!query.settlementId && !query.requestKey) return result;
    if (query.settlementId) {
      const [settlement] = await this.db.query(
        'SELECT id FROM settlements WHERE id=$1 AND owner_id=$2',
        [query.settlementId, query.ownerId],
      );
      if (!settlement) throw new NotFoundException('Settlement not found');
    }
    const [generation] = await this.db.query<{ settlement_id: string }[]>(
      `SELECT settlement_id FROM settlement_generations WHERE company_id=$1 AND owner_id=$2
       AND (($3::uuid IS NOT NULL AND settlement_id=$3) OR ($4::uuid IS NOT NULL AND idempotency_key=$4))`,
      [
        companyId,
        query.ownerId,
        query.settlementId ?? null,
        query.requestKey ?? null,
      ],
    );
    if (!generation) {
      if (query.requestKey) {
        const [cancelled] = await this.db.query(
          'SELECT 1 FROM settlement_generation_cancellations WHERE company_id=$1 AND owner_id=$2 AND idempotency_key=$3',
          [companyId, query.ownerId, query.requestKey],
        );
        result.requestCancelled = !!cancelled;
      }
      return result;
    }
    result.generation = await this.view(
      this.db.manager,
      generation.settlement_id,
      companyId,
    );
    const [eligibility] = await this.db.query<{ canVoid: boolean }[]>(
      `SELECT (g.state='active' AND s.transfer_reference IS NULL
        AND NOT EXISTS(SELECT 1 FROM settlement_payout_movements m WHERE m.settlement_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM settlement_payout_outbox j WHERE j.settlement_id=s.id AND
          NOT(j.payout_id IS NULL AND (j.status='queued' OR (j.status='failed' AND COALESCE(j.error_code,'') IN ('configuration_error','provider_rejected','source_changed')))))) AS "canVoid"
       FROM settlements s JOIN settlement_generations g ON g.settlement_id=s.id AND g.company_id=$2 WHERE s.id=$1`,
      [generation.settlement_id, companyId],
    );
    result.canVoid = result.enabled && eligibility?.canVoid === true;
    return result;
  }

  async generate(
    companyId: string,
    actorId: string,
    dto: GenerateSettlementDto,
  ): Promise<SettlementGenerationDto> {
    this.config.assertEnabled('MERCADOPAGO_PAYOUTS');
    if (!dto.confirmed)
      throw new BadRequestException(
        'Explicit generation confirmation required',
      );
    return this.db
      .transaction(async (manager) => {
        const [owner] = await manager.query(
          'SELECT id FROM owners WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR NO KEY UPDATE',
          [dto.ownerId, companyId],
        );
        if (!owner) throw new NotFoundException('Owner not found');
        const [existing] = await manager.query<
          { settlement_id: string; request: GenerateSettlementDto }[]
        >(
          'SELECT settlement_id,request FROM settlement_generations WHERE company_id=$1 AND idempotency_key=$2',
          [companyId, dto.idempotencyKey],
        );
        if (existing) {
          if (
            !isDeepStrictEqual(
              existing.request,
              Object.fromEntries(
                Object.entries(dto).filter(([, value]) => value !== undefined),
              ),
            )
          )
            throw new ConflictException(
              'Generation key already used with different input',
            );
          return this.view(manager, existing.settlement_id, companyId);
        }
        const [cancelled] = await manager.query(
          'SELECT 1 FROM settlement_generation_cancellations WHERE company_id=$1 AND idempotency_key=$2',
          [companyId, dto.idempotencyKey],
        );
        if (cancelled)
          throw new ConflictException('Generation request was cancelled');
        const initial = await this.calculation.calculate(
          manager,
          companyId,
          dto,
        );
        if (initial.fingerprint !== dto.expectedFingerprint)
          throw new ConflictException(
            'Calculation changed; review a fresh preview',
          );
        if (!initial.invoices.length)
          throw new ConflictException('No unreserved paid invoices to settle');
        await this.lockSources(
          manager,
          companyId,
          initial.invoices.map((i) => i.id),
        );
        const calculation = await this.calculation.calculate(
          manager,
          companyId,
          dto,
        );
        if (calculation.fingerprint !== dto.expectedFingerprint)
          throw new ConflictException('Calculation changed while confirming');
        const [legacy] = await manager.query(
          `SELECT s.id FROM settlements s WHERE s.owner_id=$1 AND s.period=$2 AND s.status<>'cancelled'
         AND NOT EXISTS(SELECT 1 FROM settlement_generations g WHERE g.settlement_id=s.id) LIMIT 1`,
          [dto.ownerId, dto.period],
        );
        if (legacy)
          throw new ConflictException(
            'Historical settlement requires source reconciliation',
          );
        const withheld = BigInt(dto.additionalWithholdings.replace('.', ''));
        const net =
          BigInt(calculation.netBeforeWithholdings.replace('.', '')) - withheld;
        if (
          net <= 0n ||
          net > 999999999999999n ||
          BigInt(calculation.grossAmount.replace('.', '')) > 999999999999999n
        )
          throw new ConflictException(
            'Settlement net amount is outside supported bounds',
          );
        const netAmount = `${net / 100n}.${(net % 100n).toString().padStart(2, '0')}`;
        const snapshot: SettlementGenerationSnapshotDto = {
          calculation,
          additionalWithholdings: dto.additionalWithholdings,
          withholdingReason: dto.withholdingReason,
          netAmount,
        };
        const settlementId = randomUUID();
        const generationId = randomUUID();
        await manager.query(
          `INSERT INTO settlements(id,owner_id,period,gross_amount,commission_amount,withholdings_amount,net_amount,currency,status,scheduled_date)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)`,
          [
            settlementId,
            dto.ownerId,
            dto.period,
            calculation.grossAmount,
            calculation.commissionAmount,
            dto.additionalWithholdings,
            netAmount,
            dto.currency,
            calculation.scheduledDate,
          ],
        );
        await manager.query(
          `INSERT INTO settlement_generations(id,company_id,settlement_id,owner_id,requested_by,idempotency_key,request,snapshot)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
          [
            generationId,
            companyId,
            settlementId,
            dto.ownerId,
            actorId,
            dto.idempotencyKey,
            JSON.stringify(dto),
            JSON.stringify(snapshot),
          ],
        );
        for (const invoice of calculation.invoices)
          await manager.query(
            'INSERT INTO settlement_generation_sources(company_id,generation_id,invoice_id,snapshot) VALUES($1,$2,$3,$4::jsonb)',
            [companyId, generationId, invoice.id, JSON.stringify(invoice)],
          );
        return this.view(manager, settlementId, companyId);
      })
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === '23505')
          throw new ConflictException(
            'Generation key or source was already reserved; reload the calculation',
          );
        throw error;
      });
  }

  /** Tombstone an uncommitted request under the same owner lock as generation. Never voids a settlement. */
  async cancelRequest(
    companyId: string,
    actorId: string,
    dto: CancelSettlementGenerationRequestDto,
  ): Promise<SettlementGenerationOverviewDto> {
    if (!dto.confirmed)
      throw new BadRequestException(
        'Explicit cancellation confirmation required',
      );
    await this.db.transaction(async (manager) => {
      const [owner] = await manager.query(
        'SELECT id FROM owners WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR NO KEY UPDATE',
        [dto.ownerId, companyId],
      );
      if (!owner) throw new NotFoundException('Owner not found');
      const [existing] = await manager.query<{ owner_id: string }[]>(
        'SELECT owner_id FROM settlement_generations WHERE company_id=$1 AND idempotency_key=$2',
        [companyId, dto.requestKey],
      );
      if (existing) {
        if (existing.owner_id !== dto.ownerId)
          throw new ConflictException('Request belongs to another owner');
        return;
      }
      await manager.query(
        'INSERT INTO settlement_generation_cancellations(company_id,idempotency_key,owner_id,cancelled_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [companyId, dto.requestKey, dto.ownerId, actorId],
      );
    });
    return this.overview(companyId, {
      ownerId: dto.ownerId,
      requestKey: dto.requestKey,
    });
  }

  private async lockSources(
    manager: EntityManager,
    companyId: string,
    invoiceIds: string[],
  ) {
    // Payment cancellation locks payment before invoice; keep the same ordering.
    await manager.query(
      `SELECT p.id FROM payments p WHERE p.company_id=$1 AND EXISTS(
      SELECT 1 FROM payment_allocations a WHERE a.payment_id=p.id AND a.invoice_id=ANY($2::uuid[])) ORDER BY p.id FOR UPDATE`,
      [companyId, invoiceIds],
    );
    await manager.query(
      'SELECT id FROM invoices WHERE company_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [companyId, invoiceIds],
    );
    await manager.query(
      'SELECT id FROM payment_allocations WHERE company_id=$1 AND invoice_id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [companyId, invoiceIds],
    );
    await manager.query(
      'SELECT id FROM credit_notes WHERE company_id=$1 AND invoice_id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',
      [companyId, invoiceIds],
    );
  }

  async assertSources(
    manager: EntityManager,
    settlementId: string,
    companyId: string,
  ): Promise<void> {
    const [generation] = await manager.query<Generation[]>(
      'SELECT id,state,snapshot FROM settlement_generations WHERE settlement_id=$1 AND company_id=$2',
      [settlementId, companyId],
    );
    // Existing settlements retain their explicit administrative payout flow.
    if (!generation) return;
    if (generation.state !== 'active') throw new SettlementSourceChangedError();
    const original = generation.snapshot.calculation;
    const [settlement] = await manager.query(
      `SELECT owner_id,period,currency,gross_amount::text,commission_amount::text,withholdings_amount::text,net_amount::text
       FROM settlements WHERE id=$1`,
      [settlementId],
    );
    if (
      !isDeepStrictEqual(settlement, {
        owner_id: original.ownerId,
        period: original.period,
        currency: original.currency,
        gross_amount: original.grossAmount,
        commission_amount: original.commissionAmount,
        withholdings_amount: generation.snapshot.additionalWithholdings,
        net_amount: generation.snapshot.netAmount,
      })
    )
      throw new SettlementSourceChangedError();
    const ids = original.invoices.map((i) => i.id);
    await this.lockSources(manager, companyId, ids);
    try {
      const current = await this.calculation.calculate(
        manager,
        companyId,
        original,
        ids,
        original.commissionRate,
      );
      if (!isDeepStrictEqual(current.invoices, original.invoices))
        throw new SettlementSourceChangedError();
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      )
        throw new SettlementSourceChangedError();
      throw error;
    }
  }

  async void(
    companyId: string,
    actorId: string,
    settlementId: string,
    dto: VoidSettlementGenerationDto,
  ): Promise<SettlementGenerationDto> {
    this.config.assertEnabled('MERCADOPAGO_PAYOUTS');
    if (!dto.confirmed)
      throw new BadRequestException('Explicit void confirmation required');
    return this.db.transaction(async (manager) => {
      // Match worker order: job, settlement. A newly inserted job requires a retry.
      const [job] = await manager.query(
        'SELECT * FROM settlement_payout_outbox WHERE company_id=$1 AND settlement_id=$2 FOR UPDATE',
        [companyId, settlementId],
      );
      const [settlement] = await manager.query(
        `SELECT s.id,s.transfer_reference FROM settlements s JOIN owners o ON o.id=s.owner_id AND o.company_id=$1 AND o.deleted_at IS NULL WHERE s.id=$2 FOR UPDATE OF s`,
        [companyId, settlementId],
      );
      if (!settlement) throw new NotFoundException('Settlement not found');
      const current = await this.view(manager, settlementId, companyId);
      if (current.state === 'voided') return current;
      const [newJob] = await manager.query(
        'SELECT id FROM settlement_payout_outbox WHERE company_id=$1 AND settlement_id=$2',
        [companyId, settlementId],
      );
      if (!job && newJob)
        throw new ConflictException('Payout changed; reload before voiding');
      const safe =
        !job ||
        (!job.payout_id &&
          (job.status === 'queued' ||
            (job.status === 'failed' &&
              [
                'configuration_error',
                'provider_rejected',
                'source_changed',
              ].includes(job.error_code))));
      const [movement] = await manager.query(
        'SELECT id FROM settlement_payout_movements WHERE settlement_id=$1 LIMIT 1',
        [settlementId],
      );
      if (!safe || settlement.transfer_reference || movement)
        throw new ConflictException(
          'Submitted or uncertain transfers require reconciliation before voiding',
        );
      if (job)
        await manager.query(
          `UPDATE settlement_payout_outbox SET status='failed',error_code='generation_voided',claim_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`,
          [job.id],
        );
      await manager.query(
        `UPDATE settlements SET status='cancelled',updated_at=now() WHERE id=$1`,
        [settlementId],
      );
      await manager.query(
        `UPDATE settlement_generations SET state='voided',voided_by=$2,voided_at=now(),void_reason=$3 WHERE id=$1`,
        [current.id, actorId, dto.reason],
      );
      await manager.query(
        'UPDATE settlement_generation_sources SET released_at=now() WHERE generation_id=$1 AND released_at IS NULL',
        [current.id],
      );
      return this.view(manager, settlementId, companyId);
    });
  }
}
