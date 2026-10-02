import { apiClient } from "../api";
import { getToken } from "../auth";

export type FinancialSettings = {
  configured: boolean;
  commissionTaxRate: number | null;
  source: string | null;
  effectiveFrom: string | null;
};
export type FinancialSettingsInput = {
  commissionTaxRate: number;
  source: string;
  effectiveFrom: string;
};
export const companySettingsApi = {
  getFinancial: (): Promise<FinancialSettings> =>
    apiClient.get<FinancialSettings>(
      "/companies/current/financial-settings",
      getToken() ?? undefined,
    ),
  updateFinancial: (
    payload: FinancialSettingsInput,
    key: string,
  ): Promise<FinancialSettings> =>
    apiClient.patch<FinancialSettings>(
      "/companies/current/financial-settings",
      payload,
      getToken() ?? undefined,
      { "Idempotency-Key": key },
    ),
};
