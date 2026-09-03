import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type BatchReportRun = {
  id: string;
  reportType: 'monthly_summary' | 'settlement';
  status: 'pending' | 'running' | 'completed' | 'failed';
  ownerName: string;
  period: string | null;
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  dryRun: boolean;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

type ReportRunsResponse = {
  data: BatchReportRun[];
  total: number;
  page: number;
  limit: number;
};

const MOCK_REPORTS: BatchReportRun[] = [
  {
    id: 'report-1',
    reportType: 'monthly_summary',
    status: 'completed',
    ownerName: 'Carlos Gómez',
    period: new Date().toISOString().slice(0, 7),
    recordsTotal: 12,
    recordsProcessed: 12,
    recordsFailed: 0,
    dryRun: false,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    errorMessage: null,
  },
];

export const reportsApi = {
  async getRecent(): Promise<BatchReportRun[]> {
    if (IS_MOCK_MODE) return MOCK_REPORTS;
    const response = await apiClient.get<ReportRunsResponse>(
      '/dashboard/reports?page=1&limit=50',
    );
    return [...response.data].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  },
};
