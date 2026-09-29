import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
  RequestSettlementPayoutDto,
  ReviewSettlementPayoutDto,
  SettlementPayoutOverviewDto,
} from "@/generated/openapi";
export type {
  RequestSettlementPayoutDto,
  ReviewSettlementPayoutDto,
  SettlementPayoutOverviewDto,
} from "@/generated/openapi";

export type PayoutSettlement = {
  id: string;
  ownerId: string;
  period: string;
  netAmount: string;
  currencyCode: string;
  status: string;
  transferReference: string | null;
};
const path = (id: string) => `/settlements/${encodeURIComponent(id)}`;
export const settlementPayoutsApi = {
  downloadReceipt: async (
    settlementId: string,
    movementId: string,
  ): Promise<void> => {
    const token = getToken();
    if (!token) throw new Error("Authentication required");
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(
      `${baseUrl}${path(settlementId)}/payout/movements/${encodeURIComponent(movementId)}/receipt`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) throw new Error("Receipt download failed");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    try {
      link.href = url;
      link.download = `liquidacion-${movementId.replaceAll(/[^a-zA-Z0-9-]/g, "")}.pdf`;
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      URL.revokeObjectURL(url);
    }
  },
  list: (ownerId: string) =>
    apiClient.get<PayoutSettlement[]>(
      `/settlements?ownerId=${encodeURIComponent(ownerId)}`,
      getToken() || undefined,
    ),
  settlement: (id: string) =>
    apiClient.get<PayoutSettlement>(path(id), getToken() || undefined),
  overview: (id: string) =>
    apiClient.get<SettlementPayoutOverviewDto>(
      `${path(id)}/payout`,
      getToken() || undefined,
    ),
  request: (id: string, data: RequestSettlementPayoutDto) =>
    apiClient.post<SettlementPayoutOverviewDto>(
      `${path(id)}/payout`,
      data,
      getToken() || undefined,
    ),
  review: (id: string, data: ReviewSettlementPayoutDto) =>
    apiClient.post<SettlementPayoutOverviewDto>(
      `${path(id)}/payout/review`,
      data,
      getToken() || undefined,
    ),
};
