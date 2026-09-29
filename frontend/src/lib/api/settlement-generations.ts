import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
  GenerateSettlementDto,
  SettlementCalculationDto,
  SettlementGenerationDto,
  SettlementGenerationOverviewDto,
} from "@/generated/openapi";
export type {
  GenerateSettlementDto,
  SettlementCalculationDto,
  SettlementGenerationDto,
  SettlementGenerationOverviewDto,
} from "@/generated/openapi";

export const settlementGenerationsApi = {
  overview: (
    ownerId: string,
    filter: { settlementId?: string; requestKey?: string } = {},
  ) => {
    const params = new URLSearchParams({ ownerId, ...filter });
    return apiClient.get<SettlementGenerationOverviewDto>(
      `/settlements/generation/overview?${params}`,
      getToken() || undefined,
    );
  },
  preview: (ownerId: string, period: string, currency: string) =>
    apiClient.get<SettlementCalculationDto>(
      `/settlements/calculation/preview?${new URLSearchParams({ ownerId, period, currency })}`,
      getToken() || undefined,
    ),
  generate: (data: GenerateSettlementDto) =>
    apiClient.post<SettlementGenerationDto>(
      "/settlements/generate",
      data,
      getToken() || undefined,
    ),
  void: (id: string, reason: string) =>
    apiClient.post<SettlementGenerationDto>(
      `/settlements/${encodeURIComponent(id)}/generation/void`,
      { confirmed: true, reason },
      getToken() || undefined,
    ),
  cancelRequest: (ownerId: string, requestKey: string) =>
    apiClient.post<SettlementGenerationOverviewDto>(
      "/settlements/generation/cancel-request",
      { ownerId, requestKey, confirmed: true },
      getToken() || undefined,
    ),
};
