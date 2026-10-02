import { apiClient } from "../api";
import { getToken } from "../auth";
import type { CreateInterestedProfileInput } from "@/types/interested";
import type { PipelineStage } from "../interested-import";

export type ImportReview = {
  rows: Array<{
    index: number;
    data: CreateInterestedProfileInput;
    duplicateIds: string[];
    duplicateRows: number[];
  }>;
  existing: Array<Record<string, unknown>>;
  reviewToken: string;
};
export type MergeReview = {
  people: Array<{
    id: string;
    first_name?: string;
    last_name?: string;
    phone: string;
    email?: string;
    consent_contact: boolean;
  }>;
  related: Record<string, unknown[]>;
  impact: string[];
  reviewToken: string;
};
const path = "/interested/workflow";
export const interestedWorkflowApi = {
  previewImport: (rows: CreateInterestedProfileInput[]) =>
    apiClient.post<ImportReview>(
      `${path}/import/preview`,
      { rows },
      getToken() ?? undefined,
    ),
  applyImport: (request: {
    rows: CreateInterestedProfileInput[];
    reviewToken: string;
    skipRows: number[];
  }) =>
    apiClient.post<unknown>(`${path}/import`, request, getToken() ?? undefined),
  previewMerge: (request: { targetId: string; sourceId: string }) =>
    apiClient.post<MergeReview>(
      `${path}/merge/preview`,
      request,
      getToken() ?? undefined,
    ),
  merge: (request: {
    targetId: string;
    sourceId: string;
    reviewToken: string;
  }) =>
    apiClient.post<unknown>(`${path}/merge`, request, getToken() ?? undefined),
  pipeline: () =>
    apiClient.get<PipelineStage[]>(`${path}/pipeline`, getToken() ?? undefined),
  configurePipeline: (request: { stages: PipelineStage[] }) =>
    apiClient.patch<unknown>(
      `${path}/pipeline`,
      request,
      getToken() ?? undefined,
    ),
  move: (request: { profileId: string; stageId: string }) =>
    apiClient.patch<unknown>(
      `${path}/pipeline/${request.profileId}`,
      { stageId: request.stageId },
      getToken() ?? undefined,
    ),
};
