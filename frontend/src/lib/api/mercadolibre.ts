import { apiClient } from "../api";
import { getToken } from "../auth";
import type {
  CompleteMercadoLibreAuthorizationDto,
  MercadoLibreAuthorizationDto,
  MercadoLibreConnectionStatusDto,
} from "@/generated/openapi";

export type MercadoLibreStatus = MercadoLibreConnectionStatusDto;
export type MercadoLibreCallback = CompleteMercadoLibreAuthorizationDto;
const base = "/integrations/mercadolibre";
export const mercadoLibreApi = {
  status: () =>
    apiClient.get<MercadoLibreStatus>(
      `${base}/status`,
      getToken() || undefined,
    ),
  begin: () =>
    apiClient.post<MercadoLibreAuthorizationDto>(
      `${base}/authorization`,
      {},
      getToken() || undefined,
    ),
  complete: (data: MercadoLibreCallback) =>
    apiClient.post<MercadoLibreStatus>(
      `${base}/authorization/complete`,
      data,
      getToken() || undefined,
    ),
  disconnect: () =>
    apiClient.delete<MercadoLibreStatus>(
      `${base}/connection`,
      getToken() || undefined,
    ),
};

export function authorizationDestination(value: string): string {
  const url = new URL(value);
  if (
    url.origin !== "https://auth.mercadolibre.com.ar" ||
    url.pathname !== "/authorization" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Invalid authorization destination");
  return url.href;
}

// Keep authorization codes only in memory; never persist them or render provider errors.
export function readAuthorizationCallback(
  search: string,
): MercadoLibreCallback | null {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (
    params.has("error") ||
    params.getAll("code").length !== 1 ||
    params.getAll("state").length !== 1 ||
    !code ||
    code.length > 2048 ||
    !state ||
    !/^[A-Za-z0-9_-]{43}$/.test(state)
  )
    return null;
  return { code, state };
}
