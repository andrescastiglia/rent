import { apiClient } from './client';
import type {
  AgendaEntry,
  AgendaPage,
  AgendaPerson,
  AgendaTaskInput,
} from '../../../shared/agenda';
export type {
  AgendaEntry,
  AgendaPage,
  AgendaPerson,
  AgendaTaskInput,
} from '../../../shared/agenda';
export const agendaApi = {
  config: () =>
    apiClient.get<{
      timezone: string;
      reminderMinutes: number;
      reminderHour: number;
    }>('/agenda/config'),
  person: (type: string, id: string) =>
    apiClient.get<{
      name: string;
      phone: string | null;
      email: string | null;
    } | null>(`/agenda/people/${type}/${id}`),
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
      undefined,
      { 'Idempotency-Key': key },
    ),
  list: (query: Record<string, string | number> = {}) =>
    apiClient.get<AgendaPage>(
      `/agenda?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`,
    ),
  entry: (id: string) =>
    apiClient.get<AgendaEntry>(`/agenda/entries/${encodeURIComponent(id)}`),
  people: (search = '') =>
    apiClient.get<AgendaPerson[]>(
      `/agenda/people?search=${encodeURIComponent(search)}`,
    ),
  staff: () =>
    apiClient.get<Array<{ id: string; name: string }>>('/agenda/staff'),
  create: (body: AgendaTaskInput, key: string) =>
    apiClient.post<{ id: string }>('/agenda/tasks', body, undefined, {
      'Idempotency-Key': key,
    }),
  update: (
    id: string,
    body: Partial<AgendaTaskInput> & { version: number },
    key: string,
  ) =>
    apiClient.patch(
      `/agenda/entries/${encodeURIComponent(id)}`,
      body,
      undefined,
      { 'Idempotency-Key': key },
    ),
};
