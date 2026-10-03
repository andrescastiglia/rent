import { apiClient } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  AgendaEntry,
  AgendaPage,
  AgendaPerson,
  AgendaTaskInput,
  WebNotice,
} from "../../../../shared/agenda";
export type {
  AgendaEntry,
  AgendaPage,
  AgendaPerson,
  AgendaTaskInput,
  WebNotice,
} from "../../../../shared/agenda";
const token = () => getToken() ?? undefined;
export const agendaApi = {
  config: () =>
    apiClient.get<{
      timezone: string;
      reminderMinutes: number;
      reminderHour: number;
    }>("/agenda/config", token()),
  list: (query: Record<string, string | number> = {}) =>
    apiClient.get<AgendaPage>(
      `/agenda?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
      token(),
    ),
  entry: (id: string) =>
    apiClient.get<AgendaEntry>(
      `/agenda/entries/${encodeURIComponent(id)}`,
      token(),
    ),
  people: (search = "") =>
    apiClient.get<AgendaPerson[]>(
      `/agenda/people?search=${encodeURIComponent(search)}`,
      token(),
    ),
  person: (type: string, id: string) =>
    apiClient.get<{
      name: string;
      phone: string | null;
      email: string | null;
    } | null>(
      `/agenda/people/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
      token(),
    ),
  staff: () =>
    apiClient.get<Array<{ id: string; name: string }>>(
      "/agenda/staff",
      token(),
    ),
  create: (body: AgendaTaskInput, key: string) =>
    apiClient.post<{ id: string }>("/agenda/tasks", body, token(), {
      "Idempotency-Key": key,
    }),
  update: (
    id: string,
    body: Partial<AgendaTaskInput> & { version: number },
    key: string,
  ) =>
    apiClient.patch(
      `/agenda/entries/${encodeURIComponent(id)}`,
      body,
      token(),
      { "Idempotency-Key": key },
    ),
  settings: (
    id: string,
    body: {
      version: string;
      responsibleUserId: string | null;
      reminderMinutes: number;
      reminderHour: number;
    },
    key: string,
  ) =>
    apiClient.patch(
      `/agenda/entries/${encodeURIComponent(id)}/settings`,
      body,
      token(),
      { "Idempotency-Key": key },
    ),
  history: (id: string) =>
    apiClient.get<
      Array<{
        event: string;
        version: number;
        createdAt: string;
        after: Record<string, unknown>;
      }>
    >(`/agenda/entries/${encodeURIComponent(id)}/history`, token()),
};
export const noticesApi = {
  list: (page = 1) =>
    apiClient.get<{
      data: WebNotice[];
      unread: number;
      total: number;
      page: number;
    }>(`/notifications/web?page=${page}`, token()),
  read: (id: string) =>
    apiClient.post(`/notifications/web/${id}/read`, {}, token()),
  destination: (id: string) =>
    apiClient.get<{ path: string }>(
      `/notifications/web/${id}/destination`,
      token(),
    ),
  config: () =>
    apiClient.get<{ publicKey: string | null; enabled: boolean }>(
      "/notifications/web/config",
      token(),
    ),
  subscribe: (subscription: PushSubscription) =>
    apiClient.post(
      "/notifications/web/subscriptions",
      subscription.toJSON(),
      token(),
    ),
  unsubscribe: (endpoint: string, authToken?: string) =>
    apiClient.post(
      "/notifications/web/subscriptions/remove",
      { endpoint },
      authToken ?? token(),
    ),
  preferences: () =>
    apiClient.get<Array<{ event: string; enabled: boolean }>>(
      "/notifications/web/preferences",
      token(),
    ),
  setPreferences: (preferences: Array<{ event: string; enabled: boolean }>) =>
    apiClient.patch("/notifications/web/preferences", { preferences }, token()),
};
