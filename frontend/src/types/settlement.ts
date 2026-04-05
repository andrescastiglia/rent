export type SettlementStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface Settlement {
  id: string;
  ownerId: string;
  ownerName: string;
  period: string;
  totalIncome: number;
  commissionAmount: number;
  netAmount: number;
  status: SettlementStatus;
  scheduledDate: string | null;
  processedAt: string | null;
  transferReference: string | null;
  notes: string | null;
  receiptPdfUrl: string | null;
  receiptName: string | null;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementSummary {
  totalPending: number;
  totalCompleted: number;
  totalProcessing: number;
  pendingAmount: number;
  completedAmount: number;
}

export interface SettlementFilters {
  status?: SettlementStatus | "all";
  ownerId?: string;
  period?: string;
  limit?: number;
}
