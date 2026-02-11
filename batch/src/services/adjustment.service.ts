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
  | "casa_propia"
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
      return this.applyIndexAdjustment("icl", lease, result);
    }

    if (lease.adjustmentType === "igp_m" || lease.adjustmentType === "igpm") {
      return this.applyIndexAdjustment("igp_m", lease, result);
    }

    if (lease.adjustmentType === "ipc") {
      return this.applyIndexAdjustment("ipc", lease, result);
    }

    if (lease.adjustmentType === "casa_propia") {
      return this.applyIndexAdjustment("casa_propia", lease, result);
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
    indexType: "icl" | "igp_m" | "ipc" | "casa_propia",
    lease: LeaseAdjustmentData,
    result: AdjustmentResult,
  ): Promise<AdjustmentResult> {
    try {
      const currentIndex = await this.getLatestIndex(indexType);
      const baseIndex = await this.getBaseIndex(indexType, lease);

      if (!currentIndex || !baseIndex) {
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
    indexType: "icl" | "igp_m" | "ipc" | "casa_propia" | "igpm",
  ): Promise<{ value: number; period: Date } | null> {
    const normalizedIndexType = this.normalizeIndexType(indexType);
    const result = await AppDataSource.query(
      `SELECT value, period 
             FROM inflation_indices 
             WHERE index_type = $1 
             ORDER BY period DESC 
             LIMIT 1`,
      [normalizedIndexType],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      value: Number.parseFloat(result[0].value),
      period: new Date(result[0].period),
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
    indexType: "icl" | "igp_m" | "ipc" | "casa_propia" | "igpm",
    lease: LeaseAdjustmentData,
  ): Promise<{ value: number; period: Date } | null> {
    const normalizedIndexType = this.normalizeIndexType(indexType);
    const baseDate = lease.lastAdjustmentDate || new Date();
    const startOfMonth = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      1,
    );

    const result = await AppDataSource.query(
      `SELECT value, period 
             FROM inflation_indices 
             WHERE index_type = $1 AND period <= $2
             ORDER BY period DESC 
             LIMIT 1`,
      [normalizedIndexType, startOfMonth],
    );

    if (result.length === 0) {
      return null;
    }

    return {
      value: Number.parseFloat(result[0].value),
      period: new Date(result[0].period),
    };
  }

  private normalizeIndexType(indexType: string): string {
    if (indexType === "igpm") {
      return "igp_m";
    }
    return indexType;
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
