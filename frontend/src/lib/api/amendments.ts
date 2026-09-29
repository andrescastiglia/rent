import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
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
