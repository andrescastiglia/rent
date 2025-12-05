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

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const token = getToken();
    return apiClient.get<DashboardStats>('/dashboard/stats', token ?? undefined);
  },
};
