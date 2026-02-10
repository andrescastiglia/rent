import { apiClient } from '../api';
import { getToken } from '../auth';
import { interestedApi } from './interested';
import { ownersApi } from './owners';

export interface DashboardStats {
  totalProperties: number;
  totalTenants: number;
  activeLeases: number;
  monthlyIncome: number;
  currencyCode: string;
  totalPayments: number;
  totalInvoices: number;
  monthlyCommissions: number;
}

export type PersonActivitySource = 'interested' | 'owner';
export type PersonActivityStatus = 'pending' | 'completed' | 'cancelled';

export interface PersonActivityItem {
  id: string;
  sourceType: PersonActivitySource;
  personType: PersonActivitySource;
  personId: string;
  personName: string;
  subject: string;
  body: string | null;
  status: PersonActivityStatus;
  dueAt: string | null;
  completedAt: string | null;
  propertyId: string | null;
  propertyName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PeopleActivityResponse {
  overdue: PersonActivityItem[];
  today: PersonActivityItem[];
  total: number;
}

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const token = getToken();
    return apiClient.get<DashboardStats>('/dashboard/stats', token ?? undefined);
  },

  getRecentActivity: async (
    limit: 10 | 25 | 50 = 25
  ): Promise<PeopleActivityResponse> => {
    const token = getToken();
    return apiClient.get<PeopleActivityResponse>(
      `/dashboard/recent-activity?limit=${limit}`,
      token ?? undefined
    );
  },

  completePersonActivity: async (activity: PersonActivityItem): Promise<void> => {
    if (activity.sourceType === 'interested') {
      await interestedApi.updateActivity(activity.personId, activity.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
      return;
    }

    await ownersApi.updateActivity(activity.personId, activity.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
  },

  updatePersonActivityComment: async (
    activity: PersonActivityItem,
    comment: string,
  ): Promise<void> => {
    if (activity.sourceType === 'interested') {
      await interestedApi.updateActivity(activity.personId, activity.id, {
        body: comment,
      });
      return;
    }

    await ownersApi.updateActivity(activity.personId, activity.id, {
      body: comment,
    });
  },
};
