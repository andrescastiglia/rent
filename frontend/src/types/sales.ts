export interface SaleFolder {
  id: string;
  companyId?: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleAgreement {
  id: string;
  folderId: string;
  propertyId: string;
  contractId?: string | null;
  buyerId?: string | null;
  buyerName: string;
  buyerPhone: string;
  totalAmount: number;
  currency: string;
  installmentAmount: number;
  installmentCount: number;
  startDate: string;
  dueDay: number;
  paidAmount: number;
  notes?: string;
  folder?: SaleFolder;
  createdAt: string;
  updatedAt: string;
}

export interface SaleReceipt {
  id: string;
  agreementId: string;
  receiptNumber: string;
  installmentNumber: number;
  amount: number;
  currency: string;
  paymentDate: string;
  balanceAfter: number;
  overdueAmount: number;
  copyCount: number;
  pdfUrl?: string | null;
  status?: "completed" | "cancelled";
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SaleInstallment = {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  balance: number;
  currency: string;
  status: "paid" | "overdue" | "partial" | "pending";
};
export type SaleSchedule = {
  data: SaleInstallment[];
  total: number;
  page: number;
  limit: number;
  asOf: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  credit: number;
  overdueAmount: number;
};

export interface CreateSaleFolderInput {
  name: string;
  description?: string;
}

export interface CreateSaleAgreementInput {
  folderId: string;
  propertyId: string;
  buyerId: string;
  totalAmount: number;
  currency?: string;
  installmentAmount: number;
  installmentCount: number;
  startDate: string;
  dueDay?: number;
  notes?: string;
}

export interface CreateSaleReceiptInput {
  amount: number;
  paymentDate: string;
  installmentNumber?: number;
}
