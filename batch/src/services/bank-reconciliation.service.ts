import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";

export interface ReconcileBankOptions {
  limit: number;
  minAgeMinutes: number;
  companyId?: string;
  dryRun: boolean;
}

export interface ReconcileBankSummary {
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  recordsSkipped: number;
  alertsOpened: number;
  alertsResolved: number;
  errorLog: object[];
}

interface BankMovementCandidate {
  id: string;
  company_id: string;
  provider: string;
  external_id: string;
}

interface ReconciliationResponse {
  status?: string;
  reason?: string | null;
  paymentId?: string | null;
}

export class BankReconciliationBatchService {
  private readonly backendUrl = (
    process.env.BACKEND_INTERNAL_URL ??
    `http://localhost:${process.env.BACKEND_PORT ?? "3001"}`
  ).replace(/\/$/, "");
  private readonly internalToken =
    process.env.BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN?.trim() ?? "";

  async process(options: ReconcileBankOptions): Promise<ReconcileBankSummary> {
    const candidates = await this.findCandidates(options);
    const summary: ReconcileBankSummary = {
      recordsTotal: candidates.length,
      recordsProcessed: 0,
      recordsFailed: 0,
      recordsSkipped: 0,
      alertsOpened: 0,
      alertsResolved: 0,
      errorLog: [],
    };

    if (options.dryRun) {
      summary.recordsSkipped = candidates.length;
      logger.info("Dry run: bank movements selected for reconciliation", {
        count: candidates.length,
      });
      return summary;
    }
    if (!this.internalToken) {
      throw new Error(
        "BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN not configured",
      );
    }

    for (const movement of candidates) {
      await this.processCandidate(movement, summary);
    }
    return summary;
  }

  private async findCandidates(
    options: ReconcileBankOptions,
  ): Promise<BankMovementCandidate[]> {
    return AppDataSource.query(
      `SELECT movement.id, movement.company_id, movement.provider,
              movement.external_id
         FROM bank_movements movement
         LEFT JOIN bank_reconciliations reconciliation
           ON reconciliation.movement_id = movement.id
        WHERE movement.direction = 'credit'
          AND movement.status IN ('pending', 'unmatched')
          AND movement.occurred_at <= NOW() - ($2 * INTERVAL '1 minute')
          AND ($3::uuid IS NULL OR movement.company_id = $3::uuid)
          AND (
            reconciliation.id IS NULL
            OR reconciliation.status IN ('processing', 'unmatched', 'failed')
          )
        ORDER BY movement.occurred_at ASC, movement.id ASC
        LIMIT $1`,
      [options.limit, options.minAgeMinutes, options.companyId ?? null],
    );
  }

  private async processCandidate(
    movement: BankMovementCandidate,
    summary: ReconcileBankSummary,
  ): Promise<void> {
    try {
      const result = await this.requestReconciliation(movement.id);
      if (result.status === "matched") {
        summary.recordsProcessed += 1;
        summary.alertsResolved += await this.resolveAlert(movement.id);
        return;
      }

      const reason =
        result.reason?.trim() || "Movement remains unmatched after retry";
      summary.recordsSkipped += 1;
      summary.alertsOpened += await this.openAlert(movement, reason, {
        reconciliationStatus: result.status ?? "unknown",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      summary.recordsFailed += 1;
      summary.errorLog.push({ movementId: movement.id, error: reason });
      summary.alertsOpened += await this.openAlert(movement, reason, {
        reconciliationStatus: "request_failed",
      });
      logger.error("Bank movement reconciliation failed", {
        movementId: movement.id,
        error: reason,
      });
    }
  }

  private async requestReconciliation(
    movementId: string,
  ): Promise<ReconciliationResponse> {
    const response = await fetch(
      `${this.backendUrl}/bank-reconciliation/internal/movements/${movementId}/reconcile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-batch-bank-token": this.internalToken,
        },
      },
    );
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const message = body.message ?? body.error ?? `HTTP ${response.status}`;
      throw new Error(String(message));
    }
    return body as ReconciliationResponse;
  }

  private async openAlert(
    movement: BankMovementCandidate,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<number> {
    const [row] = await AppDataSource.query(
      `INSERT INTO bank_reconciliation_alerts (
         company_id, movement_id, status, reason, metadata
       ) VALUES ($1, $2, 'open', $3, $4::jsonb)
       ON CONFLICT (movement_id) DO UPDATE
         SET status = 'open',
             reason = EXCLUDED.reason,
             occurrence_count = bank_reconciliation_alerts.occurrence_count + 1,
             last_detected_at = NOW(),
             resolved_at = NULL,
             resolved_by = NULL,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        movement.company_id,
        movement.id,
        reason,
        JSON.stringify({
          source: "reconcile-bank",
          provider: movement.provider,
          externalId: movement.external_id,
          ...metadata,
        }),
      ],
    );
    return row?.inserted === true || row?.inserted === "t" ? 1 : 0;
  }

  private async resolveAlert(movementId: string): Promise<number> {
    const result = await AppDataSource.query(
      `UPDATE bank_reconciliation_alerts
          SET status = 'resolved',
              resolved_at = NOW(),
              resolved_by = NULL,
              updated_at = NOW()
        WHERE movement_id = $1
          AND status = 'open'
      RETURNING id`,
      [movementId],
    );
    const rows = Array.isArray(result[0]) ? result[0] : result;
    return rows.length > 0 ? 1 : 0;
  }
}
