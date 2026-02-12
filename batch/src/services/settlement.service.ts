import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";

/**
 * Settlement status.
 */
export type SettlementStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

/**
 * Settlement record.
 */
export interface Settlement {
  id: string;
  ownerId: string;
  period: string;
  grossAmount: number;
  commissionAmount: number;
  withholdingsAmount: number;
  netAmount: number;
  currency: string;
  status: SettlementStatus;
  scheduledDate: Date;
  processedAt?: Date;
  transferReference?: string;
  bankAccountId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Settlement calculation result.
 */
export interface SettlementCalculation {
  ownerId: string;
  ownerName: string;
  period: string;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    tenant: string;
    property: string;
    amount: number;
    paidAt: Date;
    dueDate: Date;
  }>;
  grossAmount: number;
  commission: {
    type: "percentage" | "fixed";
    value: number;
    amount: number;
  };
  withholdings: Array<{
    type: string;
    amount: number;
  }>;
  totalDeductions: number;
  netAmount: number;
  scheduledDate: Date;
}

/**
 * Settlement processing result.
 */
export interface SettlementResult {
  success: boolean;
  settlementId?: string;
  transferReference?: string;
  error?: string;
}

/**
 * Service for managing owner settlements and liquidations.
 * Implements T881, T882, T883 requirements.
 */
export class SettlementService {
  private readonly defaultCommissionPercentage: number;

  constructor() {
    this.defaultCommissionPercentage = Number.parseFloat(
      process.env.DEFAULT_COMMISSION_PERCENTAGE || "5",
    );
  }

  /**
   * Calculates the settlement for an owner for a given period.
   *
   * @param ownerId - Owner ID.
   * @param period - Period string (YYYY-MM).
   * @returns Settlement calculation details.
   */
  async calculateSettlement(
    ownerId: string,
    period: string,
  ): Promise<SettlementCalculation> {
    const [year, month] = period.split("-").map(Number);
    logger.info("Calculating settlement", { ownerId, period });

    // Get owner info and commission settings
    const ownerResult = await AppDataSource.query(
      `SELECT 
                u.first_name, 
                u.last_name, 
                o.commission_rate
             FROM users u
             JOIN owners o ON o.user_id = u.id
             WHERE o.user_id = $1`,
      [ownerId],
    );

    if (ownerResult.length === 0) {
      throw new Error(`Owner not found: ${ownerId}`);
    }

    const owner = ownerResult[0];
    const ownerName = `${owner.first_name} ${owner.last_name}`;
    const commissionValue =
      Number.parseFloat(owner.commission_rate) ||
      this.defaultCommissionPercentage;

    // Get paid invoices for the period
    const invoicesResult = await AppDataSource.query(
      `SELECT 
                i.id,
                i.invoice_number,
                CONCAT(tu.first_name, ' ', tu.last_name) as tenant,
                COALESCE(p.name, p.address_street) as property,
                i.total_amount as amount,
                p2.payment_date as paid_at,
                i.due_date
             FROM invoices i
             JOIN leases l ON l.id = i.lease_id
             LEFT JOIN properties p ON p.id = l.property_id
             JOIN tenant_accounts ta ON ta.id = i.tenant_account_id
             JOIN tenants t ON t.user_id = ta.tenant_id
             JOIN users tu ON tu.id = t.user_id
             LEFT JOIN payments p2 ON p2.invoice_id = i.id AND p2.status = 'completed'
             WHERE i.owner_id = $1
               AND EXTRACT(YEAR FROM i.period_start) = $2
               AND EXTRACT(MONTH FROM i.period_start) = $3
               AND i.status = 'paid'
               AND i.deleted_at IS NULL`,
      [ownerId, year, month],
    );

    const invoices = invoicesResult.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      tenant: row.tenant as string,
      property: (row.property as string) || "N/A",
      amount: Number.parseFloat(row.amount as string),
      paidAt: row.paid_at ? new Date(row.paid_at as string) : new Date(),
      dueDate: new Date(row.due_date as string),
    }));

    const grossAmount = invoices.reduce(
      (sum: number, i: { amount: number }) => sum + i.amount,
      0,
    );

    // Calculate commission (always percentage for now)
    const commissionAmount = grossAmount * (commissionValue / 100);

    // Get withholdings (if owner is retention agent)
    const withholdings: Array<{ type: string; amount: number }> = [];

    // TODO: In future, fetch actual withholding configurations from company settings
    // For now, no additional withholdings beyond commission

    const totalDeductions =
      commissionAmount + withholdings.reduce((sum, w) => sum + w.amount, 0);
    const netAmount = grossAmount - totalDeductions;

    // Calculate scheduled date based on T883 logic
    const scheduledDate = this.calculateScheduledDate(invoices, period);

    return {
      ownerId,
      ownerName,
      period,
      invoices,
      grossAmount,
      commission: {
        type: "percentage",
        value: commissionValue,
        amount: commissionAmount,
      },
      withholdings,
      totalDeductions,
      netAmount,
      scheduledDate,
    };
  }

  /**
   * Calculates the scheduled settlement date based on T883 logic:
   * - If payment received before due date → settle on due date
   * - If payment received after due date → settle same day
   *
   * For batch processing, we take the latest applicable date.
   */
  private calculateScheduledDate(
    invoices: Array<{ paidAt: Date; dueDate: Date }>,
    period: string,
  ): Date {
    if (invoices.length === 0) {
      // Default to last day of period if no invoices
      const [year, month] = period.split("-").map(Number);
      return new Date(year, month, 0); // Last day of month
    }

    let latestScheduledDate = new Date(0);

    for (const invoice of invoices) {
      const paidAt = invoice.paidAt;
      const dueDate = invoice.dueDate;

      // T883 logic
      let scheduledDate: Date;
      if (paidAt < dueDate) {
        // Payment before due date → settle on due date
        scheduledDate = dueDate;
      } else {
        // Payment after due date → settle same day as payment
        scheduledDate = paidAt;
      }

      if (scheduledDate > latestScheduledDate) {
        latestScheduledDate = scheduledDate;
      }
    }

    return latestScheduledDate;
  }

  /**
   * Gets pending settlements that should be processed today.
   */
  async getPendingSettlements(): Promise<
    Array<{ ownerId: string; period: string }>
  > {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find owners with paid invoices that haven't been settled yet
    const result = await AppDataSource.query(
      `SELECT DISTINCT 
                i.owner_id,
                TO_CHAR(i.period_start, 'YYYY-MM') as period
             FROM invoices i
             LEFT JOIN settlements s ON s.owner_id = i.owner_id 
                 AND s.period = TO_CHAR(i.period_start, 'YYYY-MM')
                 AND s.status IN ('completed', 'processing')
             LEFT JOIN payments p ON p.invoice_id = i.id AND p.status = 'completed'
             WHERE i.status = 'paid'
               AND i.deleted_at IS NULL
               AND s.id IS NULL
               AND (
                   -- Payment before due date and due date is today or past
                   (p.payment_date < i.due_date AND i.due_date <= $1)
                   OR
                   -- Payment after due date (settle immediately)
                   (p.payment_date >= i.due_date AND p.payment_date <= $1)
               )`,
      [today.toISOString().split("T")[0]],
    );

    return result.map((row: Record<string, unknown>) => ({
      ownerId: row.owner_id as string,
      period: row.period as string,
    }));
  }

  /**
   * Processes a settlement - calculates, records, and initiates transfer.
   *
   * @param ownerId - Owner ID.
   * @param period - Period string.
   * @param dryRun - If true, calculates but doesn't persist or transfer.
   */
  async processSettlement(
    ownerId: string,
    period: string,
    dryRun = false,
  ): Promise<SettlementResult> {
    logger.info("Processing settlement", { ownerId, period, dryRun });

    try {
      const calculation = await this.calculateSettlement(ownerId, period);

      if (calculation.invoices.length === 0) {
        logger.info("No invoices to settle", { ownerId, period });
        return { success: true };
      }

      if (calculation.netAmount <= 0) {
        logger.warn("Net amount is zero or negative", {
          ownerId,
          period,
          netAmount: calculation.netAmount,
        });
        return { success: true };
      }

      if (dryRun) {
        logger.info("Dry run - settlement calculated", {
          ownerId,
          period,
          grossAmount: calculation.grossAmount,
          commission: calculation.commission.amount,
          netAmount: calculation.netAmount,
          scheduledDate: calculation.scheduledDate,
          invoiceCount: calculation.invoices.length,
        });
        return { success: true };
      }

      // Check if settlement already exists
      const existing = await AppDataSource.query(
        `SELECT id, status FROM settlements WHERE owner_id = $1 AND period = $2`,
        [ownerId, period],
      );

      if (existing.length > 0) {
        if (existing[0].status === "completed") {
          logger.info("Settlement already completed", { ownerId, period });
          return { success: true, settlementId: existing[0].id };
        }
      }

      // Create or update settlement record
      const settlementId = await this.upsertSettlementRecord(calculation);

      // Initiate transfer (placeholder - would integrate with bank/payment provider)
      const transferResult = await this.initiateTransfer(
        settlementId,
        calculation,
      );

      if (transferResult.success) {
        await this.markSettlementCompleted(
          settlementId,
          transferResult.reference!,
        );

        // Notify owner
        await this.notifyOwner(calculation);

        logger.info("Settlement processed successfully", {
          settlementId,
          ownerId,
          period,
          netAmount: calculation.netAmount,
        });
      } else {
        await this.markSettlementFailed(
          settlementId,
          transferResult.error || "Unknown error",
        );
        return { success: false, error: transferResult.error };
      }

      return {
        success: true,
        settlementId,
        transferReference: transferResult.reference,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Settlement processing failed", {
        ownerId,
        period,
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Creates or updates a settlement record in the database.
   */
  private async upsertSettlementRecord(
    calculation: SettlementCalculation,
  ): Promise<string> {
    const result = await AppDataSource.query(
      `INSERT INTO settlements (
                id, owner_id, period, gross_amount, commission_amount, 
                withholdings_amount, net_amount, status, scheduled_date, created_at, updated_at
             ) VALUES (
                uuid_generate_v4(), $1, $2, $3, $4, $5, $6, 'processing', $7, NOW(), NOW()
             )
             ON CONFLICT (owner_id, period) 
             DO UPDATE SET 
                gross_amount = EXCLUDED.gross_amount,
                commission_amount = EXCLUDED.commission_amount,
                withholdings_amount = EXCLUDED.withholdings_amount,
                net_amount = EXCLUDED.net_amount,
                status = 'processing',
                scheduled_date = EXCLUDED.scheduled_date,
                updated_at = NOW()
             RETURNING id`,
      [
        calculation.ownerId,
        calculation.period,
        calculation.grossAmount,
        calculation.commission.amount,
        calculation.withholdings.reduce((sum, w) => sum + w.amount, 0),
        calculation.netAmount,
        calculation.scheduledDate.toISOString().split("T")[0],
      ],
    );

    return result[0].id;
  }

  /**
   * Initiates fund transfer to owner's bank account.
   * This is a placeholder - would integrate with actual payment provider.
   */
  private async initiateTransfer(
    settlementId: string,
    calculation: SettlementCalculation,
  ): Promise<{ success: boolean; reference?: string; error?: string }> {
    // TODO: Integrate with bank transfer service (Bind, Pomelo, etc.)
    // For now, simulate successful transfer

    logger.info("Initiating transfer", {
      settlementId,
      ownerId: calculation.ownerId,
      amount: calculation.netAmount,
    });

    // Simulate transfer reference
    const reference = `TRF-${Date.now()}-${calculation.ownerId.slice(0, 8)}`;

    return { success: true, reference };
  }

  /**
   * Marks a settlement as completed.
   */
  private async markSettlementCompleted(
    settlementId: string,
    transferReference: string,
  ): Promise<void> {
    await AppDataSource.query(
      `UPDATE settlements 
             SET status = 'completed', 
                 transfer_reference = $2,
                 processed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
      [settlementId, transferReference],
    );
  }

  /**
   * Marks a settlement as failed.
   */
  private async markSettlementFailed(
    settlementId: string,
    error: string,
  ): Promise<void> {
    await AppDataSource.query(
      `UPDATE settlements 
             SET status = 'failed', 
                 notes = $2,
                 updated_at = NOW()
             WHERE id = $1`,
      [settlementId, error],
    );
  }

  /**
   * Notifies owner about the settlement.
   */
  private async notifyOwner(calculation: SettlementCalculation): Promise<void> {
    // TODO: Integrate with WhatsappService/notification gateway to send notification
    logger.info("Owner notification sent", {
      ownerId: calculation.ownerId,
      ownerName: calculation.ownerName,
      netAmount: calculation.netAmount,
      period: calculation.period,
    });
  }

  /**
   * Gets settlement history for an owner.
   */
  async getSettlementHistory(
    ownerId: string,
    limit = 12,
  ): Promise<Settlement[]> {
    const result = await AppDataSource.query(
      `SELECT * FROM settlements 
             WHERE owner_id = $1 
             ORDER BY period DESC, created_at DESC
             LIMIT $2`,
      [ownerId, limit],
    );

    return result.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      ownerId: row.owner_id as string,
      period: row.period as string,
      grossAmount: Number.parseFloat(row.gross_amount as string),
      commissionAmount: Number.parseFloat(row.commission_amount as string),
      withholdingsAmount: Number.parseFloat(row.withholdings_amount as string),
      netAmount: Number.parseFloat(row.net_amount as string),
      currency: (row.currency as string) || "ARS",
      status: row.status as SettlementStatus,
      scheduledDate: new Date(row.scheduled_date as string),
      processedAt: row.processed_at
        ? new Date(row.processed_at as string)
        : undefined,
      transferReference: row.transfer_reference as string | undefined,
      bankAccountId: row.bank_account_id as string | undefined,
      notes: row.notes as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }));
  }
}
