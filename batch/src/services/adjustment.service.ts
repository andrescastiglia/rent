import { AppDataSource } from "../shared/database";
import { logger } from "../shared/logger";
import { BcraService } from "./indices/bcra.service";
import { FgvService } from "./indices/fgv.service";

/**
 * Supported adjustment types for lease contracts.
 */
export type AdjustmentType =
  | "icl"
  | "igp_m"
  | "ipc"
  | "fixed"
  | "none"
  | "igpm";

/**
 * Result of an adjustment calculation.
 */
export interface AdjustmentResult {
  originalAmount: number;
  adjustedAmount: number;
  adjustmentType: AdjustmentType;
  adjustmentRate: number;
  baseIndexValue?: number;
  currentIndexValue?: number;
}

/**
 * Lease data required for adjustment calculation.
 */
export interface LeaseAdjustmentData {
  id: string;
  rentAmount: number;
  adjustmentType: AdjustmentType;
  adjustmentRate?: number;
  nextAdjustmentDate?: Date;
  lastAdjustmentDate?: Date;
}

/**
 * Service for calculating rent adjustments based on inflation indices.
 * Supports ICL (Argentina), IGP-M (Brazil), and fixed percentage adjustments.
 */
export class AdjustmentService {
  private readonly bcraService: BcraService;
  private readonly fgvService: FgvService;

  /**
   * Creates an instance of AdjustmentService.
   *
   * @param bcraService - Service for BCRA API calls.
   * @param fgvService - Service for BCB/FGV API calls.
   */
  constructor(bcraService?: BcraService, fgvService?: FgvService) {
    this.bcraService = bcraService || new BcraService();
    this.fgvService = fgvService || new FgvService();
  }

  /**
   * Calculates the adjusted rent amount for a lease.
   *
   * @param lease - Lease data with adjustment configuration.
   * @returns Adjustment result with original and adjusted amounts.
   */
  async calculateAdjustedRent(
    lease: LeaseAdjustmentData,
    billingDate: Date = new Date(),
  ): Promise<AdjustmentResult> {
    const result: AdjustmentResult = {
      originalAmount: lease.rentAmount,
      adjustedAmount: lease.rentAmount,
      adjustmentType: lease.adjustmentType,
      adjustmentRate: 0,
    };

    if (lease.adjustmentType === "none" || !lease.adjustmentType) {
      return result;
    }

    if (lease.adjustmentType === "fixed") {
      return this.applyFixedAdjustment(lease, result);
    }

    if (lease.adjustmentType === "icl") {
      return this.applyIndexAdjustment("icl", lease, result, billingDate);
    }

    if (lease.adjustmentType === "igp_m" || lease.adjustmentType === "igpm") {
      return this.applyIndexAdjustment("igp_m", lease, result, billingDate);
    }

    if (lease.adjustmentType === "ipc") {
      return this.applyIndexAdjustment("ipc", lease, result, billingDate);
    }

    return result;
  }

  /**
   * Applies a fixed percentage adjustment.
   */
  private applyFixedAdjustment(
    lease: LeaseAdjustmentData,
    result: AdjustmentResult,
  ): AdjustmentResult {
    const rate = lease.adjustmentRate || 0;
    result.adjustmentRate = rate;
    result.adjustedAmount = lease.rentAmount * (1 + rate / 100);
    return result;
  }

  /**
   * Applies ICL-based adjustment for Argentina.
   */
  private async applyIndexAdjustment(
    indexType: "icl" | "igp_m" | "ipc",
    lease: LeaseAdjustmentData,
    result: AdjustmentResult,
    billingDate: Date,
  ): Promise<AdjustmentResult> {
    try {
      const currentIndexTargetDate = this.resolveCurrentIndexTargetDate(
        indexType,
        billingDate,
      );
      const currentIndex = await this.getIndexForPeriod(
        indexType,
        currentIndexTargetDate,
      );
      if (!currentIndex) {
        logger.warn(`${indexType} index not available for billing period`, {
          leaseId: lease.id,
          billingDate,
          targetDate: currentIndexTargetDate,
        });
        return result;
      }

      const baseIndex = await this.getBaseIndex(indexType, lease, billingDate);

      if (!baseIndex) {
        logger.warn(`${indexType} indices not available for adjustment`, {
          leaseId: lease.id,
        });
        return result;
      }

      const variation = (currentIndex.value / baseIndex.value - 1) * 100;
      result.adjustmentRate = variation;
      result.baseIndexValue = baseIndex.value;
      result.currentIndexValue = currentIndex.value;
      result.adjustedAmount = lease.rentAmount * (1 + variation / 100);

      return result;
    } catch (error) {
      logger.error(`Failed to apply ${indexType} adjustment`, {
        leaseId: lease.id,
        error: error instanceof Error ? error.message : error,
      });
      return result;
    }
  }

  /**
   * Gets the latest index value from the database.
   *
   * @param indexType - Type of index (icl or igpm).
   * @returns Latest index data or null if not found.
   */
  async getLatestIndex(
    indexType: "icl" | "igp_m" | "ipc" | "igpm",
  ): Promise<{ value: number; period: Date } | null> {
    const normalizedIndexType = this.normalizeIndexType(indexType);
    const result = await AppDataSource.query(
      `SELECT value, period_date 
             FROM inflation_indices 
             WHERE index_type = $1 
             ORDER BY period_date DESC 
             LIMIT 1`,
      [normalizedIndexType],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      value: Number.parseFloat(result[0].value),
      period: new Date(result[0].period_date),
    };
  }

  /**
   * Gets the index value for a billing month. If missing for that month, uses
   * the latest prior month. If no prior value exists, returns null.
   */
  private async getIndexForPeriod(
    indexType: "icl" | "igp_m" | "ipc" | "igpm",
    targetDate: Date,
  ): Promise<{ value: number; period: Date } | null> {
    const normalizedIndexType = this.normalizeIndexType(indexType);
    const startOfMonth = this.toMonthStartUtc(targetDate);

    const result = await AppDataSource.query(
      `SELECT value, period_date
             FROM inflation_indices
             WHERE index_type = $1 AND period_date <= $2
             ORDER BY period_date DESC
             LIMIT 1`,
      [normalizedIndexType, startOfMonth],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      value: Number.parseFloat(result[0].value),
      period: new Date(result[0].period_date),
    };
  }

  /**
   * Gets the base index value for a lease adjustment.
   * Uses the index from the last adjustment date or contract start.
   *
   * @param indexType - Type of index (icl or igpm).
   * @param lease - Lease data with adjustment history.
   * @returns Base index data or null if not found.
   */
  private async getBaseIndex(
    indexType: "icl" | "igp_m" | "ipc" | "igpm",
    lease: LeaseAdjustmentData,
    billingDate: Date,
  ): Promise<{ value: number; period: Date } | null> {
    const normalizedIndexType = this.normalizeIndexType(indexType);
    const baseDate = lease.lastAdjustmentDate || billingDate;
    const startOfMonth = this.toMonthStartUtc(baseDate);

    const result = await AppDataSource.query(
      `SELECT value, period_date 
             FROM inflation_indices 
             WHERE index_type = $1 AND period_date <= $2
             ORDER BY period_date DESC 
             LIMIT 1`,
      [normalizedIndexType, startOfMonth],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      value: Number.parseFloat(result[0].value),
      period: new Date(result[0].period_date),
    };
  }

  private normalizeIndexType(indexType: string): string {
    if (indexType === "igpm") {
      return "igp_m";
    }
    return indexType;
  }

  private toMonthStartUtc(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private resolveCurrentIndexTargetDate(
    indexType: "icl" | "igp_m" | "ipc",
    billingDate: Date,
  ): Date {
    const monthStart = this.toMonthStartUtc(billingDate);
    if (indexType !== "icl") {
      return monthStart;
    }
    const previousMonth = new Date(monthStart);
    previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
    return previousMonth;
  }

  /**
   * Checks if an adjustment should be applied for the given lease today.
   *
   * @param lease - Lease data with adjustment configuration.
   * @returns True if adjustment should be applied.
   */
  shouldApplyAdjustment(lease: LeaseAdjustmentData): boolean {
    if (lease.adjustmentType === "none" || !lease.adjustmentType) {
      return false;
    }

    if (!lease.nextAdjustmentDate) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nextAdjustment = new Date(lease.nextAdjustmentDate);
    nextAdjustment.setHours(0, 0, 0, 0);

    return nextAdjustment <= today;
  }
}
