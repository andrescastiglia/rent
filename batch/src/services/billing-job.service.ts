import { AppDataSource } from '../shared/database';
import { logger } from '../shared/logger';

/**
 * Types of billing jobs that can be executed.
 */
export type BillingJobType =
    | 'billing'
    | 'overdue'
    | 'reminders'
    | 'late_fees'
    | 'sync_indices'
    | 'reports'
    | 'exchange_rates'
    | 'process_settlements';

/**
 * Status of a billing job.
 */
export type BillingJobStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'partial_failure';

/**
 * Billing job record from database.
 */
export interface BillingJobRecord {
    id: string;
    jobType: BillingJobType;
    status: BillingJobStatus;
    startedAt?: Date;
    completedAt?: Date;
    durationMs?: number;
    recordsTotal: number;
    recordsProcessed: number;
    recordsFailed: number;
    recordsSkipped: number;
    errorMessage?: string;
    errorLog: object[];
    parameters: object;
    dryRun: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Result data to complete a job.
 */
export interface JobCompletionData {
    recordsTotal?: number;
    recordsProcessed?: number;
    recordsFailed?: number;
    recordsSkipped?: number;
    errorLog?: object[];
}

/**
 * Service for logging batch job executions to the database.
 */
export class BillingJobService {
    /**
     * Starts a new billing job and returns its ID.
     *
     * @param jobType - Type of job being started.
     * @param parameters - Optional parameters for the job.
     * @param dryRun - Whether this is a dry run.
     * @returns The job ID.
     */
    async startJob(
        jobType: BillingJobType,
        parameters: object = {},
        dryRun: boolean = false
    ): Promise<string> {
        try {
            const result = await AppDataSource.query(
                `INSERT INTO billing_jobs (
                    job_type, status, started_at, parameters, dry_run
                ) VALUES ($1, 'running', NOW(), $2, $3)
                RETURNING id`,
                [jobType, JSON.stringify(parameters), dryRun]
            );

            const jobId = result[0].id;
            logger.info('Billing job started', { jobId, jobType, dryRun });
            return jobId;
        } catch (error) {
            logger.error('Failed to start billing job', {
                jobType,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Marks a job as completed with results.
     *
     * @param jobId - The job ID.
     * @param data - Completion data with totals.
     */
    async completeJob(jobId: string, data: JobCompletionData): Promise<void> {
        try {
            const status: BillingJobStatus =
                (data.recordsFailed ?? 0) > 0 ? 'partial_failure' : 'completed';

            await AppDataSource.query(
                `UPDATE billing_jobs 
                 SET status = $2,
                     completed_at = NOW(),
                     duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                     records_total = COALESCE($3, records_total),
                     records_processed = COALESCE($4, records_processed),
                     records_failed = COALESCE($5, records_failed),
                     records_skipped = COALESCE($6, records_skipped),
                     error_log = COALESCE($7::jsonb, error_log),
                     updated_at = NOW()
                 WHERE id = $1`,
                [
                    jobId,
                    status,
                    data.recordsTotal ?? 0,
                    data.recordsProcessed ?? 0,
                    data.recordsFailed ?? 0,
                    data.recordsSkipped ?? 0,
                    JSON.stringify(data.errorLog ?? []),
                ]
            );

            logger.info('Billing job completed', {
                jobId,
                status,
                recordsProcessed: data.recordsProcessed,
                recordsFailed: data.recordsFailed,
            });
        } catch (error) {
            logger.error('Failed to complete billing job', {
                jobId,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }

    /**
     * Marks a job as failed with an error message.
     *
     * @param jobId - The job ID.
     * @param errorMessage - The error message.
     * @param errorLog - Optional detailed error log.
     */
    async failJob(
        jobId: string,
        errorMessage: string,
        errorLog?: object[]
    ): Promise<void> {
        try {
            await AppDataSource.query(
                `UPDATE billing_jobs 
                 SET status = 'failed',
                     completed_at = NOW(),
                     duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                     error_message = $2,
                     error_log = COALESCE($3::jsonb, error_log),
                     updated_at = NOW()
                 WHERE id = $1`,
                [jobId, errorMessage, JSON.stringify(errorLog ?? [])]
            );

            logger.error('Billing job failed', { jobId, errorMessage });
        } catch (error) {
            logger.error('Failed to mark billing job as failed', {
                jobId,
                error: error instanceof Error ? error.message : error,
            });
            throw error;
        }
    }
}
