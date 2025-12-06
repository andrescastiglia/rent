import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';
import { BcraService } from './indices/bcra.service';
import { FgvService } from './indices/fgv.service';

/**
 * Supported adjustment types for lease contracts.
 */
export type AdjustmentType = 'icl' | 'igpm' | 'fixed' | 'none';

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
    lastAdjustmentRate?: number;
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
        lease: LeaseAdjustmentData
    ): Promise<AdjustmentResult> {
        const result: AdjustmentResult = {
            originalAmount: lease.rentAmount,
            adjustedAmount: lease.rentAmount,
            adjustmentType: lease.adjustmentType,
            adjustmentRate: 0,
        };

        if (lease.adjustmentType === 'none' || !lease.adjustmentType) {
            return result;
        }

        if (lease.adjustmentType === 'fixed') {
            return this.applyFixedAdjustment(lease, result);
        }

        if (lease.adjustmentType === 'icl') {
            return this.applyIclAdjustment(lease, result);
        }

        if (lease.adjustmentType === 'igpm') {
            return this.applyIgpmAdjustment(lease, result);
        }

        return result;
    }

    /**
     * Applies a fixed percentage adjustment.
     */
    private applyFixedAdjustment(
        lease: LeaseAdjustmentData,
        result: AdjustmentResult
    ): AdjustmentResult {
        const rate = lease.adjustmentRate || 0;
        result.adjustmentRate = rate;
        result.adjustedAmount = lease.rentAmount * (1 + rate / 100);
        return result;
    }

    /**
     * Applies ICL-based adjustment for Argentina.
     */
    private async applyIclAdjustment(
        lease: LeaseAdjustmentData,
        result: AdjustmentResult
    ): Promise<AdjustmentResult> {
        try {
            const currentIndex = await this.getLatestIndex('icl');
            const baseIndex = await this.getBaseIndex('icl', lease);

            if (!currentIndex || !baseIndex) {
                logger.warn('ICL indices not available for adjustment', {
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
            logger.error('Failed to apply ICL adjustment', {
                leaseId: lease.id,
                error: error instanceof Error ? error.message : error,
            });
            return result;
        }
    }

    /**
     * Applies IGP-M based adjustment for Brazil.
     */
    private async applyIgpmAdjustment(
        lease: LeaseAdjustmentData,
        result: AdjustmentResult
    ): Promise<AdjustmentResult> {
        try {
            const currentIndex = await this.getLatestIndex('igpm');
            const baseIndex = await this.getBaseIndex('igpm', lease);

            if (!currentIndex || !baseIndex) {
                logger.warn('IGP-M indices not available for adjustment', {
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
            logger.error('Failed to apply IGP-M adjustment', {
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
        indexType: 'icl' | 'igpm'
    ): Promise<{ value: number; period: Date } | null> {
        const result = await AppDataSource.query(
            `SELECT value, period 
             FROM inflation_indices 
             WHERE index_type = $1 
             ORDER BY period DESC 
             LIMIT 1`,
            [indexType]
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
        indexType: 'icl' | 'igpm',
        lease: LeaseAdjustmentData
    ): Promise<{ value: number; period: Date } | null> {
        const baseDate = lease.lastAdjustmentDate || new Date();
        const startOfMonth = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            1
        );

        const result = await AppDataSource.query(
            `SELECT value, period 
             FROM inflation_indices 
             WHERE index_type = $1 AND period <= $2
             ORDER BY period DESC 
             LIMIT 1`,
            [indexType, startOfMonth]
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
     * Checks if an adjustment should be applied for the given lease today.
     *
     * @param lease - Lease data with adjustment configuration.
     * @returns True if adjustment should be applied.
     */
    shouldApplyAdjustment(lease: LeaseAdjustmentData): boolean {
        if (lease.adjustmentType === 'none' || !lease.adjustmentType) {
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
