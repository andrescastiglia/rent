import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';

export type DashboardStats = {
  totalProperties: number;
  totalTenants: number;
  activeLeases: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  currencyCode: string;
  totalPayments: number;
  totalInvoices: number;
  monthlyCommissions: number;
};

export type DashboardLeaseOperationItem = {
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
};

export type DashboardSalePropertyItem = {
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  ownerId: string;
  ownerName: string | null;
  salePrice: number | null;
  saleCurrency: string;
  operationState: string;
  updatedAt: string;
};

export type DashboardPaymentOperationItem = {
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
};

export type DashboardOperationsOverview = {
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
};

export type PersonActivitySource = 'interested' | 'owner';
export type PersonActivityStatus = 'pending' | 'completed' | 'cancelled';

export type PersonActivityItem = {
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
};

export type PeopleActivityResponse = {
  overdue: PersonActivityItem[];
  today: PersonActivityItem[];
  total: number;
};

const MOCK_STATS: DashboardStats = {
  totalProperties: 5,
  totalTenants: 12,
  activeLeases: 8,
  monthlyIncome: 45000,
  monthlyExpenses: 8000,
  currencyCode: 'ARS',
  totalPayments: 24,
  totalInvoices: 32,
  monthlyCommissions: 5000,
};

const MOCK_OPERATIONS_OVERVIEW: DashboardOperationsOverview = {
  generatedAt: new Date().toISOString(),
  propertiesPanel: {
    totalProperties: 5,
    saleCount: 2,
    rentalActiveCount: 3,
    rentalExpiredCount: 1,
    expiringThisMonthCount: 1,
    expiringNextFourMonthsCount: 2,
    saleHighlights: [
      {
        propertyId: 'property-1',
        propertyName: 'Casa Patio Norte',
        propertyAddress: 'Belgrano 450, San Salvador',
        ownerId: 'owner-1',
        ownerName: 'Carlos Gómez',
        salePrice: 95000,
        saleCurrency: 'USD',
        operationState: 'available',
        updatedAt: new Date().toISOString(),
      },
    ],
    currentRentals: [],
    expiringThisMonth: [],
    expiringNextFourMonths: [],
    expiredRentals: [],
  },
  paymentsPanel: {
    totalPayments: 12,
    pendingPayments: 3,
    completedPayments: 9,
    overdueInvoices: 2,
    recentPayments: [
      {
        paymentId: 'payment-1',
        propertyId: 'property-1',
        propertyName: 'Edificio Central',
        leaseId: 'lease-1',
        tenantName: 'Lucia Pérez',
        amount: 250000,
        currencyCode: 'ARS',
        paymentDate: new Date().toISOString(),
        status: 'completed',
        method: 'bank_transfer',
        activityType: 'monthly',
        reference: 'TRF-123',
      },
    ],
  },
};

const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const overdueDate = new Date(startOfToday);
overdueDate.setDate(overdueDate.getDate() - 1);
overdueDate.setHours(10, 0, 0, 0);
const todayDate = new Date(startOfToday);
todayDate.setHours(16, 30, 0, 0);

const MOCK_RECENT_ACTIVITY: PeopleActivityResponse = {
  overdue: [
    {
      id: 'act-overdue-1',
      sourceType: 'interested',
      personType: 'interested',
      personId: 'int-1',
      personName: 'Lucia Perez',
      subject: 'Llamar para seguimiento',
      body: 'Validar documentación pendiente',
      status: 'pending',
      dueAt: overdueDate.toISOString(),
      completedAt: null,
      propertyId: '1',
      propertyName: 'Depto Centro',
      createdAt: overdueDate.toISOString(),
      updatedAt: overdueDate.toISOString(),
    },
  ],
  today: [
    {
      id: 'act-today-1',
      sourceType: 'owner',
      personType: 'owner',
      personId: 'owner-1',
      personName: 'Carlos Owner',
      subject: 'Enviar resumen mensual',
      body: null,
      status: 'pending',
      dueAt: todayDate.toISOString(),
      completedAt: null,
      propertyId: null,
      propertyName: null,
      createdAt: todayDate.toISOString(),
      updatedAt: todayDate.toISOString(),
    },
  ],
  total: 2,
};

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    if (IS_MOCK_MODE) {
      return MOCK_STATS;
    }

    return apiClient.get<DashboardStats>('/dashboard/stats');
  },

  async getOperationsOverview(): Promise<DashboardOperationsOverview> {
    if (IS_MOCK_MODE) {
      return MOCK_OPERATIONS_OVERVIEW;
    }

    return apiClient.get<DashboardOperationsOverview>(
      '/dashboard/operations-overview',
    );
  },

  async getRecentActivity(
    limit: 10 | 25 | 50 = 25,
  ): Promise<PeopleActivityResponse> {
    if (IS_MOCK_MODE) {
      const cappedOverdue = MOCK_RECENT_ACTIVITY.overdue.slice(0, limit);
      const remaining = Math.max(0, limit - cappedOverdue.length);
      const cappedToday = MOCK_RECENT_ACTIVITY.today.slice(0, remaining);
      return {
        overdue: cappedOverdue,
        today: cappedToday,
        total: cappedOverdue.length + cappedToday.length,
      };
    }

    return apiClient.get<PeopleActivityResponse>(
      `/dashboard/recent-activity?limit=${limit}`,
    );
  },
};
