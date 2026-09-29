import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
  MercadoLibreCategoryDto,
  MercadoLibreOptionDto,
  PortalListing,
  PortalOperationOverviewDto,
  PortalCandidateDto,
  PortalResolutionDto,
  ResolvePortalPublicationDto,
} from "@/generated/openapi";
export type {
  PortalListing,
  PortalOperationOverviewDto,
  PortalCandidateDto,
  PortalResolutionDto,
  ResolvePortalPublicationDto,
} from "@/generated/openapi";
const listingPath = (id: string) =>
  `/portals/listings/${encodeURIComponent(id)}`;
export const portalsApi = {
  category: (id: string) =>
    apiClient.get<MercadoLibreCategoryDto>(
      `/portals/mercadolibre/catalog/categories/${encodeURIComponent(id)}`,
      getToken() || undefined,
    ),
  states: () =>
    apiClient.get<MercadoLibreOptionDto[]>(
      "/portals/mercadolibre/catalog/states",
      getToken() || undefined,
    ),
  cities: (id: string) =>
    apiClient.get<MercadoLibreOptionDto[]>(
      `/portals/mercadolibre/catalog/states/${encodeURIComponent(id)}/cities`,
      getToken() || undefined,
    ),
  neighborhoods: (id: string) =>
    apiClient.get<MercadoLibreOptionDto[]>(
      `/portals/mercadolibre/catalog/cities/${encodeURIComponent(id)}/neighborhoods`,
      getToken() || undefined,
    ),
  create: (propertyId: string, listingData: Record<string, unknown>) =>
    apiClient.post<PortalListing>(
      "/portals/listings",
      { propertyId, portal: "mercadolibre", listingData },
      getToken() || undefined,
    ),
  update: (id: string, listingData: Record<string, unknown>) =>
    apiClient.patch<PortalListing>(
      listingPath(id),
      { listingData },
      getToken() || undefined,
    ),
  publish: (id: string) =>
    apiClient.post<PortalListing>(
      `${listingPath(id)}/publish`,
      {},
      getToken() || undefined,
    ),
  pause: (id: string) =>
    apiClient.post<PortalListing>(
      `${listingPath(id)}/pause`,
      {},
      getToken() || undefined,
    ),
  close: (id: string) =>
    apiClient.delete<void>(listingPath(id), getToken() || undefined),
  get: (id: string) =>
    apiClient.get<PortalListing>(listingPath(id), getToken() || undefined),
  list: (propertyId: string) =>
    apiClient.get<PortalListing[]>(
      `/portals/listings?propertyId=${encodeURIComponent(propertyId)}`,
      getToken() || undefined,
    ),
  operation: (id: string) =>
    apiClient.get<PortalOperationOverviewDto>(
      `${listingPath(id)}/operation`,
      getToken() || undefined,
    ),
  history: (id: string) =>
    apiClient.get<PortalResolutionDto[]>(
      `${listingPath(id)}/resolutions`,
      getToken() || undefined,
    ),
  candidate: (id: string, jobId: string, externalId: string) =>
    apiClient.get<PortalCandidateDto>(
      `${listingPath(id)}/operations/${encodeURIComponent(jobId)}/candidate/${encodeURIComponent(externalId)}`,
      getToken() || undefined,
    ),
  resolve: (id: string, jobId: string, data: ResolvePortalPublicationDto) =>
    apiClient.post<PortalResolutionDto>(
      `${listingPath(id)}/operations/${encodeURIComponent(jobId)}/resolve`,
      data,
      getToken() || undefined,
    ),
  refresh: (id: string) =>
    apiClient.post<PortalOperationOverviewDto>(
      `${listingPath(id)}/refresh`,
      {},
      getToken() || undefined,
    ),
};
export function safePortalLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      (url.hostname !== "mercadolibre.com.ar" &&
        !url.hostname.endsWith(".mercadolibre.com.ar"))
    )
      return undefined;
    url.protocol = "https:";
    return url.href;
  } catch {
    return undefined;
  }
}
