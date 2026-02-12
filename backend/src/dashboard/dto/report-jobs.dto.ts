import { BillingJobStatus } from '../../payments/entities/billing-job.entity';

export type BatchReportType = 'monthly_summary' | 'settlement';

export class ReportJobItemDto {
  id: string;
  reportType: BatchReportType;
  status: BillingJobStatus;
  ownerId: string;
  ownerName: string;
  period: string | null;
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  dryRun: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  errorMessage: string | null;
  errorLog: Record<string, unknown>[];
}

export class ReportJobsDto {
  data: ReportJobItemDto[];
  total: number;
  page: number;
  limit: number;
}
