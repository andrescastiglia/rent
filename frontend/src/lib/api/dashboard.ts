import { apiClient } from "../api";
import { getToken } from "../auth";
import { interestedApi } from "./interested";
import { ownersApi } from "./owners";

export interface DashboardStats {
  totalProperties: number;
  totalTenants: number;
  activeLeases: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  currencyCode: string;
  totalPayments: number;
  totalInvoices: number;
  monthlyCommissions: number;
}

export interface DashboardLeaseOperationItem {
  leaseId: string;
  propertyId: string | null;
  propertyName: string | null;
  propertyAddress: string | null;
  ownerId: string;
  ownerName: string | null;
  tenantId: string | null;
  tenantName: string | null;
  status: string;
  contractType: string;
  startDate: string | null;
  endDate: string | null;
  monthlyRent: number | null;
  currency: string;
  daysUntilEnd: number | null;
  renewalAlertEnabled: boolean;
  renewalAlertPeriodicity: string;
  renewalAlertCustomDays: number | null;
}

export interface DashboardSalePropertyItem {
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  ownerId: string;
  ownerName: string | null;
  salePrice: number | null;
  saleCurrency: string;
  operationState: string;
  updatedAt: string;
}

export interface DashboardPaymentOperationItem {
  paymentId: string;
  propertyId: string | null;
  propertyName: string | null;
  leaseId: string | null;
  tenantName: string | null;
  amount: number;
  currencyCode: string;
  paymentDate: string;
  status: string;
  method: string;
  activityType: string;
  reference: string | null;
}

export interface DashboardOperationsOverview {
  generatedAt: string;
  propertiesPanel: {
    totalProperties: number;
    saleCount: number;
    rentalActiveCount: number;
    rentalExpiredCount: number;
    expiringThisMonthCount: number;
    expiringNextFourMonthsCount: number;
    saleHighlights: DashboardSalePropertyItem[];
    currentRentals: DashboardLeaseOperationItem[];
    expiringThisMonth: DashboardLeaseOperationItem[];
    expiringNextFourMonths: DashboardLeaseOperationItem[];
    expiredRentals: DashboardLeaseOperationItem[];
  };
  paymentsPanel: {
    totalPayments: number;
    pendingPayments: number;
    completedPayments: number;
    overdueInvoices: number;
    recentPayments: DashboardPaymentOperationItem[];
  };
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

  getOperationsOverview: async (): Promise<DashboardOperationsOverview> => {
    const token = getToken();
    return apiClient.get<DashboardOperationsOverview>(
      "/dashboard/operations-overview",
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
