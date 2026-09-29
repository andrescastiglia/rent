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
