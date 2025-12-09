import {
  BillingJobType,
  BillingJobStatus,
} from '../../payments/entities/billing-job.entity';

/**
 * DTO for a single recent activity item (batch job execution).
 */
export class RecentActivityItemDto {
  id: string;
  jobType: BillingJobType;
  status: BillingJobStatus;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  recordsSkipped: number;
  dryRun: boolean;
}

/**
 * DTO for the recent activity response.
 */
export class RecentActivityDto {
  items: RecentActivityItemDto[];
  total: number;
  limit: number;
}
