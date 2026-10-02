import { z } from "zod";
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

const summarySchema = z.object({
  totals: z
    .array(
      z.object({
        currencyCode: z.string().regex(/^[A-Z]{3}$/),
        status: z.enum([
          "pending",
          "processing",
          "completed",
          "failed",
          "cancelled",
        ]),
        netAmount: z.string().regex(/^-?\d+\.\d{2}$/),
        count: z.number().int().nonnegative(),
        lastProcessedAt: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .refine(
      (totals) =>
        new Set(totals.map((item) => `${item.currencyCode}:${item.status}`))
          .size === totals.length,
    ),
});

function filterQuery(
  filters: SettlementFilters = {},
  includeLimit = true,
): string {
  if (filters.period && (filters.periodStart || filters.periodEnd))
    throw new Error("Use period or a period range");
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.currency) params.set("currency", filters.currency);
  const start = filters.period ?? filters.periodStart,
    end = filters.period ?? filters.periodEnd;
  if (start) params.set("periodStart", start);
  if (end) params.set("periodEnd", end);
  if (includeLimit && filters.limit !== undefined)
    params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}
function filteredMock(filters: SettlementFilters = {}): Settlement[] {
  const start = filters.period ?? filters.periodStart,
    end = filters.period ?? filters.periodEnd;
  return MOCK_SETTLEMENTS.filter(
    (row) =>
      (!filters.ownerId || row.ownerId === filters.ownerId) &&
      (!filters.status ||
        filters.status === "all" ||
        row.status === filters.status) &&
      (!filters.currency || row.currencyCode === filters.currency) &&
      (!start || row.period >= start) &&
      (!end || row.period <= end),
  );
}

export const settlementsApi = {
  getAll: async (filters?: SettlementFilters): Promise<Settlement[]> => {
    const query = filterQuery(filters);
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return filteredMock(filters).slice(0, filters?.limit);
    }
    const token = getToken();
    const endpoint = `/settlements${query}`;
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

  getSummary: async (
    filters?: Omit<SettlementFilters, "limit">,
  ): Promise<SettlementSummary> => {
    const query = filterQuery(filters, false);
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const groups = new Map<string, SettlementSummary["totals"][number]>();
      for (const row of filteredMock(filters)) {
        const key = `${row.currencyCode}:${row.status}`,
          current = groups.get(key);
        groups.set(key, {
          currencyCode: row.currencyCode,
          status: row.status,
          netAmount: (
            (Number(current?.netAmount) || 0) + row.netAmount
          ).toFixed(2),
          count: (current?.count ?? 0) + 1,
          lastProcessedAt: row.processedAt,
        });
      }
      return { totals: [...groups.values()] };
    }
    const token = getToken();
    return summarySchema.parse(
      await apiClient.get<unknown>(
        `/settlements/summary${query}`,
        token ?? undefined,
      ),
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
    try {
      link.href = url;
      link.download = filename ?? `liquidacion-${settlementId}.pdf`;
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  },
};
