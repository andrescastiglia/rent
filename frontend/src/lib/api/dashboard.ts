import { apiClient } from "../api";
import { getToken } from "../auth";
import { interestedApi } from "./interested";
import { ownersApi } from "./owners";

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

export type PersonActivitySource = "interested" | "owner";
export type PersonActivityStatus = "pending" | "completed" | "cancelled";

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

export type BatchReportType = "monthly_summary" | "settlement";
export type BatchReportStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial_failure";

export interface BatchReportRun {
  id: string;
  reportType: BatchReportType;
  status: BatchReportStatus;
  ownerId: string;
  ownerName: string;
  period: string | null;
  recordsTotal: number;
  recordsProcessed: number;
  recordsFailed: number;
  dryRun: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  errorLog: Record<string, unknown>[];
}

export interface ReportRunsResponse {
  data: BatchReportRun[];
  total: number;
  page: number;
  limit: number;
}

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const token = getToken();
    return apiClient.get<DashboardStats>(
      "/dashboard/stats",
      token ?? undefined,
    );
  },

  getRecentActivity: async (
    limit: 10 | 25 | 50 = 25,
  ): Promise<PeopleActivityResponse> => {
    const token = getToken();
    return apiClient.get<PeopleActivityResponse>(
      `/dashboard/recent-activity?limit=${limit}`,
      token ?? undefined,
    );
  },

  getReports: async (
    page: number = 1,
    limit: number = 25,
  ): Promise<ReportRunsResponse> => {
    const token = getToken();
    return apiClient.get<ReportRunsResponse>(
      `/dashboard/reports?page=${page}&limit=${limit}`,
      token ?? undefined,
    );
  },

  completePersonActivity: async (
    activity: PersonActivityItem,
  ): Promise<void> => {
    if (activity.sourceType === "interested") {
      await interestedApi.updateActivity(activity.personId, activity.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return;
    }

    await ownersApi.updateActivity(activity.personId, activity.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  },

  updatePersonActivityComment: async (
    activity: PersonActivityItem,
    comment: string,
  ): Promise<void> => {
    if (activity.sourceType === "interested") {
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
