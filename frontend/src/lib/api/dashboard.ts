import { apiClient } from '../api';
import { getToken } from '../auth';

export interface DashboardStats {
  totalProperties: number;
  totalTenants: number;
  activeLeases: number;
  monthlyIncome: number;
  currencyCode: string;
  totalPayments: number;
  totalInvoices: number;
}

export type BillingJobType =
  | 'billing'
  | 'overdue'
  | 'reminders'
  | 'late_fees'
  | 'sync_indices'
  | 'reports'
  | 'exchange_rates'
  | 'process_settlements';

export type BillingJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial_failure';

export interface RecentActivityItem {
  id: string;
  jobType: BillingJobType;
  status: BillingJobStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  recordsSkipped: number;
  dryRun: boolean;
}

export interface RecentActivityResponse {
  items: RecentActivityItem[];
  total: number;
  limit: number;
}

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const token = getToken();
    return apiClient.get<DashboardStats>('/dashboard/stats', token ?? undefined);
  },

  getRecentActivity: async (
    limit: 10 | 25 | 50 = 10
  ): Promise<RecentActivityResponse> => {
    const token = getToken();
    return apiClient.get<RecentActivityResponse>(
      `/dashboard/recent-activity?limit=${limit}`,
      token ?? undefined
    );
  },
};
