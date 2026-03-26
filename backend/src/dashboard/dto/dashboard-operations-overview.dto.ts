export class DashboardLeaseOperationItemDto {
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
  startDate: Date | null;
  endDate: Date | null;
  monthlyRent: number | null;
  currency: string;
  daysUntilEnd: number | null;
  renewalAlertEnabled: boolean;
  renewalAlertPeriodicity: string;
  renewalAlertCustomDays: number | null;
}

export class DashboardSalePropertyItemDto {
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  ownerId: string;
  ownerName: string | null;
  salePrice: number | null;
  saleCurrency: string;
  operationState: string;
  updatedAt: Date;
}

export class DashboardPaymentOperationItemDto {
  paymentId: string;
  propertyId: string | null;
  propertyName: string | null;
  leaseId: string | null;
  tenantName: string | null;
  amount: number;
  currencyCode: string;
  paymentDate: Date;
  status: string;
  method: string;
  activityType: string;
  reference: string | null;
}

export class DashboardPropertiesPanelDto {
  totalProperties: number;
  saleCount: number;
  rentalActiveCount: number;
  rentalExpiredCount: number;
  expiringThisMonthCount: number;
  expiringNextFourMonthsCount: number;
  saleHighlights: DashboardSalePropertyItemDto[];
  currentRentals: DashboardLeaseOperationItemDto[];
  expiringThisMonth: DashboardLeaseOperationItemDto[];
  expiringNextFourMonths: DashboardLeaseOperationItemDto[];
  expiredRentals: DashboardLeaseOperationItemDto[];
}

export class DashboardPaymentsPanelDto {
  totalPayments: number;
  pendingPayments: number;
  completedPayments: number;
  overdueInvoices: number;
  recentPayments: DashboardPaymentOperationItemDto[];
}

export class DashboardOperationsOverviewDto {
  generatedAt: Date;
  propertiesPanel: DashboardPropertiesPanelDto;
  paymentsPanel: DashboardPaymentsPanelDto;
}
