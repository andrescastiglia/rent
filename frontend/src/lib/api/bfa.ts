import { apiClient } from "../api";
import { getToken } from "../auth";

import type { BfaLeaseOverviewDto } from "@/generated/openapi";

export type BfaLeaseOverview = BfaLeaseOverviewDto;

export const bfaApi = {
  forLease: (leaseId: string) =>
    apiClient.get<BfaLeaseOverview>(
      `/digital-signatures/bfa/leases/${encodeURIComponent(leaseId)}`,
      getToken() || undefined,
    ),
  request: (documentId: string) =>
    apiClient.post(
      `/digital-signatures/documents/${encodeURIComponent(documentId)}/stamp`,
      {},
      getToken() || undefined,
    ),
};
