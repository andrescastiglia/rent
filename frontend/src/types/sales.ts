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
  createdAt: string;
  updatedAt: string;
}

export interface CreateSaleFolderInput {
  name: string;
  description?: string;
}

export interface CreateSaleAgreementInput {
  folderId: string;
  buyerName: string;
  buyerPhone: string;
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
