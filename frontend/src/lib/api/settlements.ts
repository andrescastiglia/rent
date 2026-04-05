import {
  Settlement,
  SettlementFilters,
  SettlementStatus,
  SettlementSummary,
} from "@/types/settlement";
import { apiClient } from "../api";
import { getToken } from "../auth";

const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_SETTLEMENTS: Settlement[] = [
  {
    id: "settlement-1",
    ownerId: "owner1",
    ownerName: "Carlos Rodríguez",
    period: "2025-05",
    totalIncome: 180000,
    commissionAmount: 18000,
    netAmount: 162000,
    status: "completed",
    scheduledDate: "2025-05-31",
    processedAt: "2025-05-30T12:00:00Z",
    transferReference: "TRF-20250530-001",
    notes: null,
    receiptPdfUrl: "db://document/mock-receipt-1",
    receiptName: "liquidacion-2025-05.pdf",
    currencyCode: "ARS",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "settlement-2",
    ownerId: "owner1",
    ownerName: "Carlos Rodríguez",
    period: "2025-06",
    totalIncome: 180000,
    commissionAmount: 18000,
    netAmount: 162000,
    status: "pending",
    scheduledDate: "2025-06-30",
    processedAt: null,
    transferReference: null,
    notes: null,
    receiptPdfUrl: null,
    receiptName: null,
    currencyCode: "ARS",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

type BackendSettlement = {
  id: string;
  ownerId: string;
  ownerName?: string | null;
  period: string;
  totalIncome?: number | string | null;
  grossAmount?: number | string | null;
  commissionAmount?: number | string | null;
  netAmount?: number | string | null;
  status: SettlementStatus;
  scheduledDate?: string | null;
  processedAt?: string | null;
  transferReference?: string | null;
  notes?: string | null;
  receiptPdfUrl?: string | null;
  receiptName?: string | null;
  currencyCode?: string;
  createdAt?: string;
  updatedAt?: string;
};

const mapSettlement = (raw: BackendSettlement): Settlement => ({
  id: raw.id,
  ownerId: raw.ownerId,
  ownerName: raw.ownerName ?? "",
  period: raw.period,
  totalIncome: Number(raw.totalIncome ?? raw.grossAmount ?? 0),
  commissionAmount: Number(raw.commissionAmount ?? 0),
  netAmount: Number(raw.netAmount ?? 0),
  status: raw.status,
  scheduledDate: raw.scheduledDate ?? null,
  processedAt: raw.processedAt ?? null,
  transferReference: raw.transferReference ?? null,
  notes: raw.notes ?? null,
  receiptPdfUrl: raw.receiptPdfUrl ?? null,
  receiptName: raw.receiptName ?? null,
  currencyCode: raw.currencyCode ?? "ARS",
  createdAt: raw.createdAt ?? new Date().toISOString(),
  updatedAt: raw.updatedAt ?? new Date().toISOString(),
});

export const settlementsApi = {
  getAll: async (filters?: SettlementFilters): Promise<Settlement[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      if (filters?.status && filters.status !== "all") {
        return MOCK_SETTLEMENTS.filter((s) => s.status === filters.status);
      }
      return MOCK_SETTLEMENTS;
    }

    const token = getToken();
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== "all") {
      params.set("status", filters.status);
    }
    if (filters?.ownerId) {
      params.set("ownerId", filters.ownerId);
    }
    if (filters?.period) {
      params.set("period", filters.period);
    }
    if (filters?.limit) {
      params.set("limit", String(filters.limit));
    }
    const query = params.toString();
    const endpoint = query ? `/settlements?${query}` : "/settlements";
    const data = await apiClient.get<BackendSettlement[]>(
      endpoint,
      token ?? undefined,
    );
    return data.map(mapSettlement);
  },

  getOne: async (id: string): Promise<Settlement> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const found = MOCK_SETTLEMENTS.find((s) => s.id === id);
      if (!found) throw new Error("Settlement not found");
      return found;
    }

    const token = getToken();
    const data = await apiClient.get<BackendSettlement>(
      `/settlements/${id}`,
      token ?? undefined,
    );
    return mapSettlement(data);
  },

  getSummary: async (): Promise<SettlementSummary> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return {
        totalPending: 1,
        totalCompleted: 1,
        totalProcessing: 0,
        pendingAmount: 162000,
        completedAmount: 162000,
      };
    }

    const token = getToken();
    return apiClient.get<SettlementSummary>(
      "/settlements/summary",
      token ?? undefined,
    );
  },

  downloadReceipt: async (
    settlementId: string,
    filename?: string,
  ): Promise<void> => {
    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${baseUrl}/owners/settlements/${settlementId}/receipt`,
      {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download settlement receipt");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? `liquidacion-${settlementId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
