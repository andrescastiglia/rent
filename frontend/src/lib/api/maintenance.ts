import type {
  MaintenanceTicket,
  MaintenanceTicketComment,
  MaintenanceFilters,
  CreateMaintenanceTicketInput,
  UpdateMaintenanceTicketInput,
} from "@/types/maintenance";
import {
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketArea,
  MaintenanceTicketSource,
} from "@/types/maintenance";
import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";

type BackendTicketLike = {
  id: string;
  companyId: string;
  propertyId: string;
  property?: { id: string; address: string } | null;
  reportedByUserId?: string | null;
  reportedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  source: string;
  assignedToStaffId?: string | null;
  assignedStaff?: {
    id: string;
    user: { firstName: string; lastName: string };
  } | null;
  assignedAt?: string | null;
  title: string;
  description?: string | null;
  area: string;
  priority: string;
  status: string;
  scheduledAt?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  costCurrency?: string | null;
  externalRef?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendCommentLike = {
  id: string;
  ticketId: string;
  userId?: string | null;
  user?: { firstName: string; lastName: string } | null;
  body: string;
  isInternal?: boolean | null;
  createdAt?: string | Date;
};

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldUseMock = (): boolean =>
  IS_MOCK_MODE || (getToken()?.startsWith("mock-token-") ?? false);

let MOCK_TICKETS: MaintenanceTicket[] = [
  {
    id: "mock-ticket-1",
    companyId: "mock-company-1",
    propertyId: "mock-prop-1",
    property: { id: "mock-prop-1", address: "Av. Corrientes 1234" },
    source: MaintenanceTicketSource.TENANT,
    title: "Pérdida de agua en baño",
    description:
      "Hay una pérdida de agua debajo del lavabo del baño principal.",
    area: MaintenanceTicketArea.PLUMBING,
    priority: MaintenanceTicketPriority.HIGH,
    status: MaintenanceTicketStatus.IN_PROGRESS,
    estimatedCost: 150,
    costCurrency: "ARS",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-ticket-2",
    companyId: "mock-company-1",
    propertyId: "mock-prop-2",
    property: { id: "mock-prop-2", address: "Calle Florida 567" },
    source: MaintenanceTicketSource.OWNER,
    title: "Cortocircuito en cocina",
    description: "Los enchufes de la cocina no funcionan.",
    area: MaintenanceTicketArea.ELECTRICAL,
    priority: MaintenanceTicketPriority.URGENT,
    status: MaintenanceTicketStatus.OPEN,
    costCurrency: "ARS",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-ticket-3",
    companyId: "mock-company-1",
    propertyId: "mock-prop-3",
    property: { id: "mock-prop-3", address: "Av. Santa Fe 890" },
    source: MaintenanceTicketSource.STAFF,
    title: "Pintura deteriorada en dormitorio",
    description:
      "La pintura de las paredes del dormitorio principal está en mal estado.",
    area: MaintenanceTicketArea.BEDROOM,
    priority: MaintenanceTicketPriority.LOW,
    status: MaintenanceTicketStatus.RESOLVED,
    resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    resolutionNotes: "Se realizó pintura completa del dormitorio.",
    estimatedCost: 300,
    actualCost: 280,
    costCurrency: "ARS",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

let MOCK_COMMENTS: MaintenanceTicketComment[] = [
  {
    id: "mock-comment-1",
    ticketId: "mock-ticket-1",
    userId: "mock-user-1",
    user: { firstName: "Carlos", lastName: "López" },
    body: "Se contactó al plomero para el martes.",
    isInternal: true,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-comment-2",
    ticketId: "mock-ticket-1",
    userId: "mock-user-2",
    user: { firstName: "Ana", lastName: "Martínez" },
    body: "Por favor avísenme cuando venga el técnico.",
    isInternal: false,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mapBackendTicket = (raw: BackendTicketLike): MaintenanceTicket => ({
  id: raw.id,
  companyId: raw.companyId,
  propertyId: raw.propertyId,
  property: raw.property ?? undefined,
  reportedByUserId: raw.reportedByUserId ?? undefined,
  reportedBy: raw.reportedBy ?? undefined,
  source:
    (raw.source as MaintenanceTicketSource) ?? MaintenanceTicketSource.ADMIN,
  assignedToStaffId: raw.assignedToStaffId ?? undefined,
  assignedStaff: raw.assignedStaff ?? undefined,
  assignedAt: raw.assignedAt ?? undefined,
  title: raw.title,
  description: raw.description ?? undefined,
  area: (raw.area as MaintenanceTicketArea) ?? MaintenanceTicketArea.OTHER,
  priority:
    (raw.priority as MaintenanceTicketPriority) ??
    MaintenanceTicketPriority.MEDIUM,
  status:
    (raw.status as MaintenanceTicketStatus) ?? MaintenanceTicketStatus.OPEN,
  scheduledAt: raw.scheduledAt ?? undefined,
  resolvedAt: raw.resolvedAt ?? undefined,
  resolutionNotes: raw.resolutionNotes ?? undefined,
  estimatedCost: raw.estimatedCost ?? undefined,
  actualCost: raw.actualCost ?? undefined,
  costCurrency: raw.costCurrency ?? "ARS",
  externalRef: raw.externalRef ?? undefined,
  createdAt: raw.createdAt
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString(),
  updatedAt: raw.updatedAt
    ? new Date(raw.updatedAt).toISOString()
    : new Date().toISOString(),
});

const mapBackendComment = (
  raw: BackendCommentLike,
): MaintenanceTicketComment => ({
  id: raw.id,
  ticketId: raw.ticketId,
  userId: raw.userId ?? undefined,
  user: raw.user ?? undefined,
  body: raw.body,
  isInternal: raw.isInternal ?? false,
  createdAt: raw.createdAt
    ? new Date(raw.createdAt).toISOString()
    : new Date().toISOString(),
});

function applyMockFilters(
  tickets: MaintenanceTicket[],
  filters?: MaintenanceFilters,
): MaintenanceTicket[] {
  let result = tickets;
  if (filters?.status) {
    result = result.filter((t) => t.status === filters.status);
  }
  if (filters?.priority) {
    result = result.filter((t) => t.priority === filters.priority);
  }
  if (filters?.propertyId) {
    result = result.filter((t) => t.propertyId === filters.propertyId);
  }
  if (filters?.assignedToStaffId) {
    result = result.filter(
      (t) => t.assignedToStaffId === filters.assignedToStaffId,
    );
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    result = result.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        (t.property?.address ?? "").toLowerCase().includes(term) ||
        (t.description ?? "").toLowerCase().includes(term),
    );
  }
  return result;
}

function buildFilterParams(filters?: MaintenanceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.propertyId) params.append("propertyId", filters.propertyId);
  if (filters?.assignedToStaffId)
    params.append("assignedToStaffId", filters.assignedToStaffId);
  if (filters?.search) params.append("search", filters.search);
  return params;
}

export const maintenanceApi = {
  getAll: async (
    filters?: MaintenanceFilters,
  ): Promise<MaintenanceTicket[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      return applyMockFilters([...MOCK_TICKETS], filters);
    }

    const token = getToken();
    const queryParams = buildFilterParams(filters);
    const endpoint =
      queryParams.toString().length > 0
        ? `/maintenance/tickets?${queryParams.toString()}`
        : "/maintenance/tickets";
    const result = await apiClient.get<
      BackendTicketLike[] | { data: BackendTicketLike[] }
    >(endpoint, token ?? undefined);
    const list = Array.isArray(result) ? result : result.data;
    return list.map(mapBackendTicket);
  },

  getOne: async (id: string): Promise<MaintenanceTicket> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const found = MOCK_TICKETS.find((t) => t.id === id);
      if (!found) throw new Error("Ticket not found");
      return found;
    }

    const token = getToken();
    const result = await apiClient.get<BackendTicketLike>(
      `/maintenance/tickets/${id}`,
      token ?? undefined,
    );
    return mapBackendTicket(result);
  },

  create: async (
    data: CreateMaintenanceTicketInput,
  ): Promise<MaintenanceTicket> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const newTicket: MaintenanceTicket = {
        id: `mock-ticket-${crypto.randomUUID().substring(0, 8)}`,
        companyId: "mock-company-1",
        propertyId: data.propertyId,
        property: { id: data.propertyId, address: data.propertyId },
        source: data.source ?? MaintenanceTicketSource.ADMIN,
        title: data.title,
        description: data.description,
        area: data.area,
        priority: data.priority,
        status: MaintenanceTicketStatus.OPEN,
        estimatedCost: data.estimatedCost,
        scheduledAt: data.scheduledAt,
        costCurrency: "ARS",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TICKETS = [newTicket, ...MOCK_TICKETS];
      return newTicket;
    }

    const token = getToken();
    const result = await apiClient.post<BackendTicketLike>(
      "/maintenance/tickets",
      data,
      token ?? undefined,
    );
    return mapBackendTicket(result);
  },

  update: async (
    id: string,
    data: UpdateMaintenanceTicketInput,
  ): Promise<MaintenanceTicket> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_TICKETS.findIndex((t) => t.id === id);
      if (index === -1) throw new Error("Ticket not found");
      const existing = MOCK_TICKETS[index];
      const updated: MaintenanceTicket = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        ),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TICKETS[index] = updated;
      return updated;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendTicketLike>(
      `/maintenance/tickets/${id}`,
      data,
      token ?? undefined,
    );
    return mapBackendTicket(result);
  },

  remove: async (id: string): Promise<void> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      MOCK_TICKETS = MOCK_TICKETS.filter((t) => t.id !== id);
      return;
    }

    const token = getToken();
    await apiClient.delete(`/maintenance/tickets/${id}`, token ?? undefined);
  },

  getComments: async (
    ticketId: string,
  ): Promise<MaintenanceTicketComment[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      return MOCK_COMMENTS.filter((c) => c.ticketId === ticketId);
    }

    const token = getToken();
    const result = await apiClient.get<
      BackendCommentLike[] | { data: BackendCommentLike[] }
    >(`/maintenance/tickets/${ticketId}/comments`, token ?? undefined);
    const list = Array.isArray(result) ? result : result.data;
    return list.map(mapBackendComment);
  },

  addComment: async (
    ticketId: string,
    body: string,
    isInternal: boolean,
  ): Promise<MaintenanceTicketComment> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const newComment: MaintenanceTicketComment = {
        id: `mock-comment-${crypto.randomUUID().substring(0, 8)}`,
        ticketId,
        body,
        isInternal,
        createdAt: new Date().toISOString(),
      };
      MOCK_COMMENTS = [...MOCK_COMMENTS, newComment];
      return newComment;
    }

    const token = getToken();
    const result = await apiClient.post<BackendCommentLike>(
      `/maintenance/tickets/${ticketId}/comments`,
      { body, isInternal },
      token ?? undefined,
    );
    return mapBackendComment(result);
  },
};
