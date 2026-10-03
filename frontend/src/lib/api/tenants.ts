import { normalizePropertyImages } from "../property-images";
import { collectPages } from "../pagination";
import {
  Tenant,
  TenantActivity,
  TenantActivityStatus,
  TenantActivityType,
  TenantSummary,
  CreateTenantInput,
  UpdateTenantInput,
} from "@/types/tenant";
import { apiClient, IS_MOCK_MODE } from "../api";
import { getToken } from "../auth";
import type { Lease } from "@/types/lease";
import { buildPathWithQuery } from "../safe-url";

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

type BackendTenantLike =
  import("../../../../shared/contact-data").ContactRecord & {
    id: string;
    tenantEntityId?: string;
    cuil?: string | null;
    dateOfBirth?: string | null;
    nationality?: string | null;
    occupation?: string | null;
    employer?: string | null;
    monthlyIncome?: number | null;
    employmentStatus?: NonNullable<Tenant["employmentStatus"]> | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
    creditScore?: number | null;
    notes?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    isActive?: boolean | null;
    dni?: string | null;
    contactConsent?: boolean | null;
    preferredContactChannel?: "whatsapp" | "email" | "sms" | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      isActive?: boolean | null;
    } | null;
  };

type BackendTenantActivityLike = {
  id: string;
  tenantId?: string;
  type: TenantActivityType;
  status: TenantActivityStatus;
  subject: string;
  body?: string | null;
  dueAt?: string | Date | null;
  completedAt?: string | Date | null;
  metadata?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

const isPaginatedResponse = <T>(value: any): value is PaginatedResponse<T> => {
  return !!value && typeof value === "object" && Array.isArray(value.data);
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const mapBackendTenantToTenant = (raw: BackendTenantLike): Tenant => {
  const user = raw.user ?? null;
  const firstName = raw.firstName ?? user?.firstName ?? "";
  const lastName = raw.lastName ?? user?.lastName ?? "";
  const email = raw.email ?? user?.email ?? "";
  const phone = raw.phone ?? user?.phone ?? "";
  const isActive = raw.isActive ?? user?.isActive ?? true;
  const normalizedDni =
    typeof raw.dni === "string" && raw.dni.trim().length > 0 ? raw.dni : "";

  return {
    contactAddress: raw.contactAddress,
    contactData: raw.contactData,
    latitude: raw.latitude,
    longitude: raw.longitude,
    id: raw.id,
    tenantEntityId: raw.tenantEntityId,
    cuil: raw.cuil ?? undefined,
    dateOfBirth: raw.dateOfBirth?.slice(0, 10) ?? undefined,
    nationality: raw.nationality ?? undefined,
    occupation: raw.occupation ?? undefined,
    employer: raw.employer ?? undefined,
    monthlyIncome:
      raw.monthlyIncome === null || raw.monthlyIncome === undefined
        ? undefined
        : Number(raw.monthlyIncome),
    employmentStatus: raw.employmentStatus ?? undefined,
    emergencyContactName: raw.emergencyContactName ?? undefined,
    emergencyContactPhone: raw.emergencyContactPhone ?? undefined,
    emergencyContactRelationship: raw.emergencyContactRelationship ?? undefined,
    creditScore:
      raw.creditScore === null || raw.creditScore === undefined
        ? undefined
        : Number(raw.creditScore),
    notes: raw.notes ?? undefined,
    firstName,
    lastName,
    email,
    phone,
    dni: normalizedDni,
    contactConsent: raw.contactConsent ?? false,
    preferredContactChannel: raw.preferredContactChannel ?? "whatsapp",
    status: isActive ? "ACTIVE" : "INACTIVE",
    createdAt: raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt).toISOString()
      : new Date().toISOString(),
  };
};

// Mock data for development/testing
const MOCK_TENANTS: Tenant[] = [
  {
    id: "1",
    firstName: "Juan",
    lastName: "Pérez",
    email: "juan.perez@example.com",
    phone: "+54 9 11 1234-5678",
    dni: "12345678",
    status: "ACTIVE",
    address: {
      street: "Av. Corrientes",
      number: "1000",
      city: "Buenos Aires",
      state: "CABA",
      zipCode: "1000",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    firstName: "María",
    lastName: "Gómez",
    email: "maria.gomez@example.com",
    phone: "+54 9 11 8765-4321",
    dni: "87654321",
    status: "PROSPECT",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_TENANT_ACTIVITIES: Record<string, TenantActivity[]> = {
  "1": [
    {
      id: "tenant-activity-1",
      tenantId: "1",
      type: "task",
      status: "pending",
      subject: "Enviar comprobante de pago",
      body: "Recordar el envío del comprobante antes de las 18hs.",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      completedAt: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
};

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldUseMock = (): boolean => {
  // In client-side e2e/dev runs, mock auth issues a predictable token prefix.
  // This prevents situations where auth is mocked but other API modules accidentally hit the real backend.
  return IS_MOCK_MODE || (getToken()?.startsWith("mock-token-") ?? false);
};

type TenantFilters = {
  name?: string;
  dni?: string;
  email?: string;
  page?: number;
  limit?: number;
};

type BackendLease = {
  id: string;
  propertyId?: string | null;
  tenantId?: string | null;
  ownerId: string;
  contractType?: "rental" | "sale" | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  monthlyRent?: number | null;
  fiscalValue?: number | null;
  securityDeposit?: number | null;
  currency?: string | null;
  status?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  property?: any;
};

const normalizeDate = (value: string | Date | null | undefined): string => {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
};

const mapLeaseStatus = (value: string | null | undefined): Lease["status"] => {
  switch ((value ?? "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "finalized":
      return "FINALIZED";
    case "draft":
    default:
      return "DRAFT";
  }
};

const mapBackendLeaseToLease = (raw: BackendLease): Lease => {
  const property = raw.property;

  return {
    id: raw.id,
    propertyId: raw.propertyId ?? property?.id ?? "",
    tenantId: raw.tenantId ?? undefined,
    ownerId: raw.ownerId,
    contractType: raw.contractType ?? "rental",
    startDate: raw.startDate ? normalizeDate(raw.startDate) : undefined,
    endDate: raw.endDate ? normalizeDate(raw.endDate) : undefined,
    rentAmount:
      raw.monthlyRent === null || raw.monthlyRent === undefined
        ? undefined
        : Number(raw.monthlyRent),
    depositAmount: Number(raw.securityDeposit ?? 0),
    fiscalValue:
      raw.fiscalValue === null || raw.fiscalValue === undefined
        ? undefined
        : Number(raw.fiscalValue),
    currency: raw.currency ?? "ARS",
    status: mapLeaseStatus(raw.status),
    documents: [],
    createdAt: normalizeDate(raw.createdAt),
    updatedAt: normalizeDate(raw.updatedAt),
    property: property
      ? {
          id: property.id,
          name: property.name ?? "",
          description: property.description ?? undefined,
          type: "OTHER",
          status: "ACTIVE",
          address: {
            street: property.addressStreet ?? "",
            number: property.addressNumber ?? "",
            unit: undefined,
            city: property.addressCity ?? "",
            state: property.addressState ?? "",
            zipCode: property.addressPostalCode ?? "",
            country: property.addressCountry ?? "Argentina",
          },
          features: [],
          units: [],
          images: normalizePropertyImages(property.images),
          ownerId: property.ownerId ?? raw.ownerId,
          createdAt: property.createdAt
            ? new Date(property.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: property.updatedAt
            ? new Date(property.updatedAt).toISOString()
            : new Date().toISOString(),
        }
      : undefined,
  };
};

const mapBackendTenantActivity = (
  raw: BackendTenantActivityLike,
): TenantActivity => {
  return {
    id: raw.id,
    tenantId: raw.tenantId ?? "",
    type: raw.type,
    status: raw.status,
    subject: raw.subject,
    body: raw.body ?? null,
    dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
    completedAt: raw.completedAt
      ? new Date(raw.completedAt).toISOString()
      : null,
    metadata: raw.metadata ?? {},
    createdAt: raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: raw.updatedAt
      ? new Date(raw.updatedAt).toISOString()
      : new Date().toISOString(),
  };
};

type BackendTenantPayload = Record<string, unknown>;
function serializeTenantPayload(data: UpdateTenantInput): BackendTenantPayload {
  const payload: BackendTenantPayload = {};
  if (data.normalization) payload.normalization = data.normalization;
  if (data.contactAddress !== undefined)
    payload.contactAddress = data.contactAddress;
  const strings = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "dni",
    "cuil",
    "dateOfBirth",
    "nationality",
    "occupation",
    "employer",
    "employmentStatus",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "notes",
    "preferredContactChannel",
  ] as const;
  for (const key of strings) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) payload[key] = value.trim();
  }
  if (
    typeof payload.dni === "string" &&
    (payload.dni.length > 20 || isUuid(payload.dni))
  )
    delete payload.dni;
  for (const key of ["monthlyIncome", "creditScore"] as const) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value))
      payload[key] = value;
  }
  if (typeof data.contactConsent === "boolean")
    payload.contactConsent = data.contactConsent;
  return payload;
}

export const tenantsApi = {
  getPage: async (
    filters: TenantFilters = {},
  ): Promise<PaginatedResponse<Tenant>> => {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    if (shouldUseMock()) {
      await delay(DELAY);
      const term = filters.name?.trim().toLowerCase();
      const data = MOCK_TENANTS.filter(
        (tenant) =>
          !term ||
          `${tenant.firstName} ${tenant.lastName}`.toLowerCase().includes(term),
      );
      return {
        data: data.slice((page - 1) * limit, page * limit),
        total: data.length,
        page,
        limit,
      };
    }
    const result = await apiClient.get<
      PaginatedResponse<BackendTenantLike> | BackendTenantLike[]
    >(
      buildPathWithQuery("/tenants", { ...filters, page, limit }),
      getToken() ?? undefined,
    );
    if (Array.isArray(result))
      return {
        data: result
          .slice((page - 1) * limit, page * limit)
          .map(mapBackendTenantToTenant),
        total: result.length,
        page,
        limit,
      };
    if (!isPaginatedResponse<BackendTenantLike>(result))
      throw new Error("Unexpected response shape from /tenants");
    return { ...result, data: result.data.map(mapBackendTenantToTenant) };
  },
  getAll: async (filters?: TenantFilters): Promise<Tenant[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      if (!filters?.name) {
        return MOCK_TENANTS;
      }
      const term = filters.name.toLowerCase();
      return MOCK_TENANTS.filter((tenant) =>
        tenant.lastName.toLowerCase().includes(term),
      );
    }

    const token = getToken();
    const queryParams = new URLSearchParams();
    if (filters?.name) queryParams.append("name", filters.name);
    if (filters?.dni) queryParams.append("dni", filters.dni);
    if (filters?.email) queryParams.append("email", filters.email);
    if (filters?.page) queryParams.append("page", String(filters.page));
    if (filters?.limit) queryParams.append("limit", String(filters.limit));

    const endpoint =
      queryParams.toString().length > 0
        ? `/tenants?${queryParams.toString()}`
        : "/tenants";
    const result = await apiClient.get<
      PaginatedResponse<BackendTenantLike> | BackendTenantLike[]
    >(endpoint, token ?? undefined);

    if (Array.isArray(result)) {
      return result.map(mapBackendTenantToTenant);
    }

    if (isPaginatedResponse<BackendTenantLike>(result)) {
      if (filters?.page || result.total <= result.data.length)
        return result.data.map(mapBackendTenantToTenant);
      return collectPages(async (page) => {
        if (page === 1)
          return { ...result, data: result.data.map(mapBackendTenantToTenant) };
        queryParams.set("page", String(page));
        queryParams.set("limit", String(result.limit));
        const next = await apiClient.get<PaginatedResponse<BackendTenantLike>>(
          `/tenants?${queryParams}`,
          token ?? undefined,
        );
        return { ...next, data: next.data.map(mapBackendTenantToTenant) };
      });
    }

    throw new Error("Unexpected response shape from /tenants");
  },

  getById: async (id: string): Promise<Tenant | null> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const normalizedId = decodeURIComponent(id).split("?")[0];
      return (
        MOCK_TENANTS.find((t) => t.id === normalizedId) ||
        MOCK_TENANTS[0] ||
        null
      );
    }

    const token = getToken();
    try {
      const result = await apiClient.get<BackendTenantLike>(
        `/tenants/${id}`,
        token ?? undefined,
      );
      return mapBackendTenantToTenant(result);
    } catch {
      return null;
    }
  },

  create: async (data: CreateTenantInput): Promise<Tenant> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const newTenant: Tenant = {
        ...data,
        status: data.status ?? "PROSPECT",
        id: crypto.randomUUID().substring(2, 11),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TENANTS.push(newTenant);
      return newTenant;
    }

    const token = getToken();
    const result = await apiClient.post<BackendTenantLike>(
      "/tenants",
      serializeTenantPayload(data),
      token ?? undefined,
    );
    return mapBackendTenantToTenant(result);
  },

  update: async (id: string, data: UpdateTenantInput): Promise<Tenant> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_TENANTS.findIndex((t) => t.id === id);
      if (index === -1) throw new Error("Tenant not found");

      const updatedTenant = {
        ...MOCK_TENANTS[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      MOCK_TENANTS[index] = updatedTenant;
      return updatedTenant;
    }

    const token = getToken();
    const payload = serializeTenantPayload(data);
    const result = await apiClient.patch<BackendTenantLike>(
      `/tenants/${id}`,
      payload,
      token ?? undefined,
    );
    return mapBackendTenantToTenant(result);
  },

  delete: async (id: string): Promise<void> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const index = MOCK_TENANTS.findIndex((t) => t.id === id);
      if (index !== -1) {
        MOCK_TENANTS.splice(index, 1);
      }
      return;
    }

    const token = getToken();
    await apiClient.delete(`/tenants/${id}`, token ?? undefined);
  },

  getLeaseHistory: async (id: string): Promise<Lease[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      return [];
    }

    const token = getToken();
    const result = await apiClient.get<BackendLease[]>(
      `/tenants/${id}/leases`,
      token ?? undefined,
    );
    return Array.isArray(result) ? result.map(mapBackendLeaseToLease) : [];
  },

  getActivities: async (id: string): Promise<TenantActivity[]> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const normalizedId = decodeURIComponent(id).split("?")[0];
      return [...(MOCK_TENANT_ACTIVITIES[normalizedId] ?? [])].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    const token = getToken();
    const result = await apiClient.get<BackendTenantActivityLike[]>(
      `/tenants/${id}/activities`,
      token ?? undefined,
    );
    return Array.isArray(result) ? result.map(mapBackendTenantActivity) : [];
  },

  createActivity: async (
    tenantId: string,
    data: {
      type: TenantActivityType;
      subject: string;
      body?: string;
      dueAt?: string;
      status?: TenantActivityStatus;
    },
  ): Promise<TenantActivity> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const normalizedId = decodeURIComponent(tenantId).split("?")[0];
      const item: TenantActivity = {
        id: `tenant-activity-${crypto.randomUUID().substring(0, 8)}`,
        tenantId: normalizedId,
        type: data.type,
        status: data.status ?? "pending",
        subject: data.subject,
        body: data.body ?? null,
        dueAt: data.dueAt ?? null,
        completedAt: null,
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!MOCK_TENANT_ACTIVITIES[normalizedId]) {
        MOCK_TENANT_ACTIVITIES[normalizedId] = [];
      }
      MOCK_TENANT_ACTIVITIES[normalizedId].unshift(item);
      return item;
    }

    const token = getToken();
    const result = await apiClient.post<BackendTenantActivityLike>(
      `/tenants/${tenantId}/activities`,
      data,
      token ?? undefined,
    );
    return mapBackendTenantActivity(result);
  },

  getMyProfile: async (): Promise<Tenant> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      return MOCK_TENANTS[0];
    }
    const token = getToken();
    const result = await apiClient.get<BackendTenantLike>(
      "/tenants/me",
      token ?? undefined,
    );
    return mapBackendTenantToTenant(result);
  },

  getMySummary: async (): Promise<TenantSummary> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      return {
        activeLease: null,
        accountBalance: 0,
        pendingInvoicesCount: 0,
        nextPaymentDue: null,
        monthlySummary: {
          period: new Date().toISOString().slice(0, 7),
          pendingAmount: 0,
          contractEndDate: null,
          contractExpiresThisMonth: false,
          nextAdjustmentDate: null,
          adjustmentDueThisMonth: false,
          adjustmentType: null,
          adjustmentValue: null,
        },
      };
    }
    const token = getToken();
    const raw = await apiClient.get<{
      tenant: unknown;
      activeLease: TenantSummary["activeLease"];
      currentBalance?: number;
      currencyCode?: string;
      pendingInvoicesCount?: number;
      nextPaymentDueDate?: string | null;
      monthlySummary?: TenantSummary["monthlySummary"];
    }>("/tenants/me/summary", token ?? undefined);
    return {
      activeLease: raw.activeLease ?? null,
      accountBalance: raw.currentBalance ?? 0,
      pendingInvoicesCount: raw.pendingInvoicesCount ?? 0,
      nextPaymentDue: raw.nextPaymentDueDate ?? null,
      monthlySummary: raw.monthlySummary ?? {
        period: new Date().toISOString().slice(0, 7),
        pendingAmount: 0,
        contractEndDate: null,
        contractExpiresThisMonth: false,
        nextAdjustmentDate: null,
        adjustmentDueThisMonth: false,
        adjustmentType: null,
        adjustmentValue: null,
      },
    };
  },

  updateActivity: async (
    tenantId: string,
    activityId: string,
    data: Partial<{
      type: TenantActivityType;
      status: TenantActivityStatus;
      subject: string;
      body: string;
      dueAt: string;
      completedAt: string;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<TenantActivity> => {
    if (shouldUseMock()) {
      await delay(DELAY);
      const normalizedId = decodeURIComponent(tenantId).split("?")[0];
      const list = MOCK_TENANT_ACTIVITIES[normalizedId] ?? [];
      const idx = list.findIndex((item) => item.id === activityId);
      if (idx < 0) {
        throw new Error("Activity not found");
      }
      const updated: TenantActivity = {
        ...list[idx],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      list[idx] = updated;
      return updated;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendTenantActivityLike>(
      `/tenants/${tenantId}/activities/${activityId}`,
      data,
      token ?? undefined,
    );
    return mapBackendTenantActivity(result);
  },
};
