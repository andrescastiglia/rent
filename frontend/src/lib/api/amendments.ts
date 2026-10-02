import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
  CreateAmendmentRequestDto,
  LeaseAmendment,
  AmendmentReviewDto,
  ReviewAmendmentDto,
  ReviewAmendmentResultDto,
} from "@/generated/openapi";
export type {
  LeaseAmendment,
  AmendmentReviewDto,
  ReviewAmendmentDto,
} from "@/generated/openapi";
const path = (id: string) => `/amendments/${encodeURIComponent(id)}`;
export const amendmentsApi = {
  create: (data: CreateAmendmentRequestDto & { idempotencyKey: string }) =>
    apiClient.post<LeaseAmendment>(
      "/amendments",
      data,
      getToken() || undefined,
    ),
  transition: (
    id: string,
    action: "submit" | "approve" | "reject",
    data: { idempotencyKey: string; expectedUpdatedAt: string },
  ) =>
    apiClient.patch<LeaseAmendment>(
      `${path(id)}/${action}`,
      data,
      getToken() || undefined,
    ),
  list: (leaseId: string) =>
    apiClient.get<LeaseAmendment[]>(
      `/amendments/lease/${encodeURIComponent(leaseId)}`,
      getToken() || undefined,
    ),
  history: (id: string) =>
    apiClient.get<AmendmentReviewDto[]>(
      `${path(id)}/reviews`,
      getToken() || undefined,
    ),
  review: (id: string, data: ReviewAmendmentDto) =>
    apiClient.post<ReviewAmendmentResultDto>(
      `${path(id)}/reviews`,
      data,
      getToken() || undefined,
    ),
};
