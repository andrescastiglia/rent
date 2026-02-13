import {
  Lease,
  LeaseTemplate,
  CreateLeaseInput,
  UpdateLeaseInput,
} from "@/types/lease";
import type { Property } from "@/types/property";
import type { Tenant } from "@/types/tenant";
import { apiClient } from "../api";
import { getToken, getUser } from "../auth";
import { propertiesApi } from "./properties";
import { tenantsApi } from "./tenants";

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

type BackendUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean | null;
};

type BackendTenant = {
  id: string;
  dni?: string | null;
  user?: BackendUser | null;
};

type BackendBuyerProfile = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

type BackendLease = {
  id: string;
  propertyId?: string | null;
  tenantId?: string | null;
  buyerProfileId?: string | null;
  ownerId: string;
  templateId?: string | null;
  templateName?: string | null;
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
  paymentFrequency?: string | null;
  paymentDueDay?: number | null;
  billingFrequency?: string | null;
  billingDay?: number | null;
  autoGenerateInvoices?: boolean | null;
  lateFeeType?: string | null;
  lateFeeValue?: number | null;
  lateFeeGraceDays?: number | null;
  lateFeeMax?: number | null;
  adjustmentType?: string | null;
  adjustmentValue?: number | null;
  adjustmentFrequencyMonths?: number | null;
  inflationIndexType?: string | null;
  nextAdjustmentDate?: string | Date | null;
  lastAdjustmentDate?: string | Date | null;
  termsAndConditions?: string | null;
  draftContractText?: string | null;
  confirmedContractText?: string | null;
  confirmedAt?: string | Date | null;
  previousLeaseId?: string | null;
  versionNumber?: number | null;
  documents?: any[] | null;
  property?: any;
  tenant?: BackendTenant | null;
  buyerProfile?: BackendBuyerProfile | null;
};

type BackendLeaseTemplate = {
  id: string;
  name: string;
  contractType: "rental" | "sale";
  templateBody: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendLeasePayload = {
  companyId?: string;
  propertyId?: string;
  tenantId?: string;
  buyerProfileId?: string;
  ownerId?: string;
  templateId?: string;
  contractType?: "rental" | "sale";
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  fiscalValue?: number;
  securityDeposit?: number;
  currency?: string;
  paymentFrequency?: string;
  paymentDueDay?: number;
  billingFrequency?: string;
  billingDay?: number;
  autoGenerateInvoices?: boolean;
  lateFeeType?: string;
  lateFeeValue?: number;
  lateFeeGraceDays?: number;
  lateFeeMax?: number;
  adjustmentType?: string;
  adjustmentValue?: number;
  adjustmentFrequencyMonths?: number;
  inflationIndexType?: string;
  nextAdjustmentDate?: string;
  termsAndConditions?: string;
  draftContractText?: string;
};

type LeaseListFilters = {
  includeFinalized?: boolean;
  status?: Lease["status"];
  contractType?: Lease["contractType"];
};

const isPaginatedResponse = <T>(value: any): value is PaginatedResponse<T> => {
  return !!value && typeof value === "object" && Array.isArray(value.data);
};

const isSupportedInflationIndexType = (
  value: unknown,
): value is NonNullable<Lease["inflationIndexType"]> => {
  return value === "icl" || value === "ipc" || value === "igp_m";
};

const normalizeDate = (value: string | Date | null | undefined): string => {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
};

const getCurrentCompanyId = (): string | undefined => {
  const user = getUser();
  return user?.companyId;
};

const toBackendLeasePayload = (
  data: Partial<CreateLeaseInput | UpdateLeaseInput>,
  includeCompanyId: boolean,
): BackendLeasePayload => {
  const payload: BackendLeasePayload = {};
  if (includeCompanyId) {
    payload.companyId = getCurrentCompanyId();
  }
  if (data.propertyId !== undefined) payload.propertyId = data.propertyId;
  if (data.tenantId !== undefined) payload.tenantId = data.tenantId;
  if (data.buyerProfileId !== undefined)
    payload.buyerProfileId = data.buyerProfileId;
  if (data.ownerId !== undefined) payload.ownerId = data.ownerId;
  if (data.templateId !== undefined) payload.templateId = data.templateId;
  if (data.contractType !== undefined) payload.contractType = data.contractType;
  if (data.startDate !== undefined) payload.startDate = data.startDate;
  if (data.endDate !== undefined) payload.endDate = data.endDate;
  if (data.rentAmount !== undefined) payload.monthlyRent = data.rentAmount;
  if (data.fiscalValue !== undefined) payload.fiscalValue = data.fiscalValue;
  if (data.depositAmount !== undefined)
    payload.securityDeposit = data.depositAmount;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.paymentFrequency !== undefined)
    payload.paymentFrequency = data.paymentFrequency;
  if (data.paymentDueDay !== undefined)
    payload.paymentDueDay = data.paymentDueDay;
  if (data.billingFrequency !== undefined)
    payload.billingFrequency = data.billingFrequency;
  if (data.billingDay !== undefined) payload.billingDay = data.billingDay;
  if (data.autoGenerateInvoices !== undefined)
    payload.autoGenerateInvoices = data.autoGenerateInvoices;
  if (data.lateFeeType !== undefined) payload.lateFeeType = data.lateFeeType;
  if (data.lateFeeValue !== undefined) payload.lateFeeValue = data.lateFeeValue;
  if (data.lateFeeGraceDays !== undefined)
    payload.lateFeeGraceDays = data.lateFeeGraceDays;
  if (data.lateFeeMax !== undefined) payload.lateFeeMax = data.lateFeeMax;
  if (data.adjustmentType !== undefined)
    payload.adjustmentType = data.adjustmentType;
  if (data.adjustmentValue !== undefined)
    payload.adjustmentValue = data.adjustmentValue;
  if (data.adjustmentFrequencyMonths !== undefined) {
    payload.adjustmentFrequencyMonths = data.adjustmentFrequencyMonths;
  }
  if (data.inflationIndexType !== undefined)
    payload.inflationIndexType = data.inflationIndexType;
  if (data.nextAdjustmentDate !== undefined)
    payload.nextAdjustmentDate = data.nextAdjustmentDate;
  if (data.terms !== undefined) payload.termsAndConditions = data.terms;
  return payload;
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
  const propertyRef = raw.property ?? null;
  const propertyId = raw.propertyId ?? propertyRef?.id ?? "";

  const tenantUser = raw.tenant?.user ?? null;
  const tenant: Tenant | undefined = tenantUser
    ? {
        id: raw.tenantId || "",
        firstName: tenantUser.firstName ?? "",
        lastName: tenantUser.lastName ?? "",
        email: tenantUser.email ?? "",
        phone: tenantUser.phone ?? "",
        dni: raw.tenant?.dni ?? raw.tenantId ?? "",
        status: (tenantUser.isActive ?? true) ? "ACTIVE" : "INACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : undefined;

  const property: Property | undefined = propertyRef
    ? {
        id: propertyRef.id,
        name: propertyRef.name ?? "",
        description: propertyRef.description ?? undefined,
        type: "OTHER",
        status: "ACTIVE",
        address: {
          street: propertyRef.addressStreet ?? "",
          number: propertyRef.addressNumber ?? "",
          unit: undefined,
          city: propertyRef.addressCity ?? "",
          state: propertyRef.addressState ?? "",
          zipCode: propertyRef.addressPostalCode ?? "",
          country: propertyRef.addressCountry ?? "Argentina",
        },
        features: [],
        units: [],
        images: Array.isArray(propertyRef.images)
          ? propertyRef.images
              .map((img: any) => (typeof img === "string" ? img : img?.url))
              .filter((v: any) => typeof v === "string" && v.length > 0)
          : [],
        ownerId: propertyRef.ownerId ?? raw.ownerId,
        createdAt: propertyRef.createdAt
          ? new Date(propertyRef.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: propertyRef.updatedAt
          ? new Date(propertyRef.updatedAt).toISOString()
          : new Date().toISOString(),
      }
    : undefined;

  const buyerProfile = raw.buyerProfile
    ? {
        id: raw.buyerProfile.id,
        firstName: raw.buyerProfile.firstName ?? undefined,
        lastName: raw.buyerProfile.lastName ?? undefined,
        phone: raw.buyerProfile.phone ?? "",
        email: raw.buyerProfile.email ?? undefined,
        operations: ["sale" as const],
        status: "interested" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : undefined;

  return {
    id: raw.id,
    propertyId,
    tenantId: raw.tenantId ?? undefined,
    buyerProfileId: raw.buyerProfileId ?? undefined,
    ownerId: raw.ownerId,
    templateId: raw.templateId ?? undefined,
    templateName: raw.templateName ?? undefined,
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
    terms: raw.termsAndConditions ?? undefined,
    draftContractText: raw.draftContractText ?? undefined,
    confirmedContractText: raw.confirmedContractText ?? undefined,
    confirmedAt: raw.confirmedAt ? normalizeDate(raw.confirmedAt) : undefined,
    previousLeaseId: raw.previousLeaseId ?? undefined,
    versionNumber: raw.versionNumber ?? undefined,
    documents: Array.isArray(raw.documents)
      ? raw.documents.filter((d) => typeof d === "string")
      : [],
    createdAt: normalizeDate(raw.createdAt),
    updatedAt: normalizeDate(raw.updatedAt),
    paymentFrequency: (raw.paymentFrequency as any) ?? undefined,
    paymentDueDay: raw.paymentDueDay ?? undefined,
    billingFrequency: (raw.billingFrequency as any) ?? undefined,
    billingDay: raw.billingDay ?? undefined,
    autoGenerateInvoices: raw.autoGenerateInvoices ?? undefined,
    lateFeeType: (raw.lateFeeType as any) ?? undefined,
    lateFeeValue: raw.lateFeeValue ?? undefined,
    lateFeeGraceDays: raw.lateFeeGraceDays ?? undefined,
    lateFeeMax: raw.lateFeeMax ?? undefined,
    adjustmentType: (raw.adjustmentType as any) ?? undefined,
    adjustmentValue: raw.adjustmentValue ?? undefined,
    adjustmentFrequencyMonths: raw.adjustmentFrequencyMonths ?? undefined,
    inflationIndexType: isSupportedInflationIndexType(raw.inflationIndexType)
      ? raw.inflationIndexType
      : undefined,
    nextAdjustmentDate: raw.nextAdjustmentDate
      ? normalizeDate(raw.nextAdjustmentDate)
      : undefined,
    lastAdjustmentDate: raw.lastAdjustmentDate
      ? normalizeDate(raw.lastAdjustmentDate)
      : undefined,
    property,
    tenant,
    buyerProfile,
  };
};

const mapBackendTemplateToTemplate = (
  raw: BackendLeaseTemplate,
): LeaseTemplate => ({
  id: raw.id,
  name: raw.name,
  contractType: raw.contractType,
  templateBody: raw.templateBody,
  isActive: raw.isActive,
  createdAt: raw.createdAt
    ? normalizeDate(raw.createdAt)
    : new Date().toISOString(),
  updatedAt: raw.updatedAt
    ? normalizeDate(raw.updatedAt)
    : new Date().toISOString(),
});

// Mock data for development/testing
const MOCK_LEASES: Lease[] = [
  {
    id: "1",
    propertyId: "1",
    tenantId: "1",
    ownerId: "owner-1",
    contractType: "rental",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    rentAmount: 1500,
    depositAmount: 3000,
    currency: "ARS",
    currencyData: {
      code: "ARS",
      symbol: "$",
      decimalPlaces: 2,
      isActive: true,
    },
    status: "ACTIVE",
    documents: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    propertyId: "2",
    tenantId: "2",
    ownerId: "owner-2",
    contractType: "rental",
    startDate: "2024-03-01",
    endDate: "2025-02-28",
    rentAmount: 2000,
    depositAmount: 4000,
    currency: "USD",
    currencyData: {
      code: "USD",
      symbol: "US$",
      decimalPlaces: 2,
      isActive: true,
    },
    status: "DRAFT",
    documents: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_TEMPLATES: LeaseTemplate[] = [
  {
    id: "template-rental-1",
    name: "Plantilla alquiler base",
    contractType: "rental",
    templateBody:
      "Contrato de alquiler para {{tenant.fullName}}.\n\nLa propiedad ubicada en {{property.addressStreet}} {{property.addressNumber}} se alquila por {{lease.monthlyRent}} {{lease.currency}}.",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "template-sale-1",
    name: "Plantilla compra/venta base",
    contractType: "sale",
    templateBody:
      "Contrato de compraventa para {{buyer.fullName}}.\n\nLa operación sobre {{property.name}} se pacta por {{lease.fiscalValue}} {{lease.currency}}.",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE =
  process.env.NODE_ENV === "test" ||
  process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
  process.env.CI === "true";

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const leasesApi = {
  getAll: async (filters?: LeaseListFilters): Promise<Lease[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      // Enrich with related data for list view
      const leasesWithRelations = await Promise.all(
        MOCK_LEASES.map(async (lease) => {
          const property = await propertiesApi.getById(lease.propertyId);
          const tenant = lease.tenantId
            ? await tenantsApi.getById(lease.tenantId)
            : null;
          return {
            ...lease,
            property: property || undefined,
            tenant: tenant || undefined,
          };
        }),
      );
      if (filters?.includeFinalized) {
        return leasesWithRelations.filter(
          (item) => item.status === "ACTIVE" || item.status === "FINALIZED",
        );
      }
      if (filters?.status) {
        return leasesWithRelations.filter(
          (item) => item.status === filters.status,
        );
      }
      return leasesWithRelations.filter((item) => item.status === "ACTIVE");
    }

    const token = getToken();
    const queryParams = new URLSearchParams();
    if (filters?.includeFinalized !== undefined) {
      queryParams.append("includeFinalized", String(filters.includeFinalized));
    }
    if (filters?.status)
      queryParams.append("status", filters.status.toLowerCase());
    if (filters?.contractType)
      queryParams.append("contractType", filters.contractType);
    const result = await apiClient.get<
      PaginatedResponse<BackendLease> | BackendLease[] | any
    >(
      queryParams.toString().length > 0
        ? `/leases?${queryParams.toString()}`
        : "/leases",
      token ?? undefined,
    );

    if (Array.isArray(result)) {
      return result.map(mapBackendLeaseToLease);
    }

    if (isPaginatedResponse<BackendLease>(result)) {
      return result.data.map(mapBackendLeaseToLease);
    }

    throw new Error("Unexpected response shape from /leases");
  },

  getById: async (id: string): Promise<Lease | null> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const lease = MOCK_LEASES.find((l) => l.id === id);
      if (!lease) return null;

      const property = await propertiesApi.getById(lease.propertyId);
      const tenant = lease.tenantId
        ? await tenantsApi.getById(lease.tenantId)
        : null;
      return {
        ...lease,
        property: property || undefined,
        tenant: tenant || undefined,
      };
    }

    const token = getToken();
    try {
      const result = await apiClient.get<BackendLease>(
        `/leases/${id}`,
        token ?? undefined,
      );
      return mapBackendLeaseToLease(result);
    } catch {
      return null;
    }
  },

  create: async (data: CreateLeaseInput): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const newLease: Lease = {
        ...data,
        ownerId: data.ownerId ?? "owner-mock",
        id: Math.random().toString(36).substr(2, 9),
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_LEASES.push(newLease);
      return newLease;
    }

    const token = getToken();
    const payload = toBackendLeasePayload(data, true);
    const result = await apiClient.post<BackendLease>(
      "/leases",
      payload,
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  update: async (id: string, data: UpdateLeaseInput): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_LEASES.findIndex((l) => l.id === id);
      if (index === -1) throw new Error("Lease not found");

      const updatedLease = {
        ...MOCK_LEASES[index],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      MOCK_LEASES[index] = updatedLease;
      return updatedLease;
    }

    const token = getToken();
    const payload = toBackendLeasePayload(data, false);
    const result = await apiClient.patch<BackendLease>(
      `/leases/${id}`,
      payload,
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  renew: async (
    id: string,
    data: Partial<CreateLeaseInput> = {},
  ): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const originalIndex = MOCK_LEASES.findIndex((item) => item.id === id);
      if (originalIndex < 0) {
        throw new Error("Lease not found");
      }
      const original = MOCK_LEASES[originalIndex];
      const today = new Date();
      const fallbackStartDate =
        original.endDate ?? today.toISOString().slice(0, 10);
      const startDate = data.startDate ?? fallbackStartDate;
      const fallbackEndDate = (() => {
        const start = new Date(startDate);
        start.setFullYear(start.getFullYear() + 1);
        return start.toISOString().slice(0, 10);
      })();
      const endDate = data.endDate ?? original.endDate ?? fallbackEndDate;

      if (original.status === "ACTIVE") {
        MOCK_LEASES[originalIndex] = {
          ...original,
          status: "FINALIZED",
          updatedAt: new Date().toISOString(),
        };
      }

      const renewed: Lease = {
        ...original,
        ...data,
        id: `lease-${Math.random().toString(36).slice(2, 10)}`,
        status: "DRAFT",
        previousLeaseId: original.id,
        startDate,
        endDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_LEASES.unshift(renewed);
      return renewed;
    }

    const token = getToken();
    const payload = toBackendLeasePayload(data, false);
    const result = await apiClient.patch<BackendLease>(
      `/leases/${id}/renew`,
      payload,
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  renderDraft: async (id: string, templateId?: string): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) throw new Error("Lease not found");
      const template =
        MOCK_TEMPLATES.find((item) => item.id === templateId) ??
        MOCK_TEMPLATES.find((item) => item.contractType === lease.contractType);
      if (!template) throw new Error("Template not found");
      lease.templateId = template.id;
      lease.templateName = template.name;
      lease.draftContractText = template.templateBody;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const token = getToken();
    const result = await apiClient.post<BackendLease>(
      `/leases/${id}/draft/render`,
      { templateId },
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  updateDraftText: async (id: string, draftText: string): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) throw new Error("Lease not found");
      lease.draftContractText = draftText;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendLease>(
      `/leases/${id}/draft-text`,
      { draftText },
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  confirmDraft: async (id: string, finalText?: string): Promise<Lease> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) throw new Error("Lease not found");
      lease.status = "ACTIVE";
      lease.confirmedAt = new Date().toISOString();
      lease.confirmedContractText = finalText ?? lease.draftContractText;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const token = getToken();
    const result = await apiClient.post<BackendLease>(
      `/leases/${id}/confirm`,
      { finalText },
      token ?? undefined,
    );
    return mapBackendLeaseToLease(result);
  },

  getTemplates: async (
    contractType?: Lease["contractType"],
  ): Promise<LeaseTemplate[]> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      return contractType
        ? MOCK_TEMPLATES.filter((item) => item.contractType === contractType)
        : [...MOCK_TEMPLATES];
    }

    const token = getToken();
    const query = contractType ? `?contractType=${contractType}` : "";
    const result = await apiClient.get<BackendLeaseTemplate[]>(
      `/leases/templates${query}`,
      token ?? undefined,
    );
    return result.map(mapBackendTemplateToTemplate);
  },

  createTemplate: async (data: {
    name: string;
    contractType: Lease["contractType"];
    templateBody: string;
    isActive?: boolean;
  }): Promise<LeaseTemplate> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const created: LeaseTemplate = {
        id: `template-${Math.random().toString(36).slice(2, 10)}`,
        name: data.name,
        contractType: data.contractType,
        templateBody: data.templateBody,
        isActive: data.isActive ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_TEMPLATES.unshift(created);
      return created;
    }

    const token = getToken();
    const result = await apiClient.post<BackendLeaseTemplate>(
      "/leases/templates",
      data,
      token ?? undefined,
    );
    return mapBackendTemplateToTemplate(result);
  },

  updateTemplate: async (
    templateId: string,
    data: Partial<{
      name: string;
      contractType: Lease["contractType"];
      templateBody: string;
      isActive: boolean;
    }>,
  ): Promise<LeaseTemplate> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_TEMPLATES.findIndex((item) => item.id === templateId);
      if (index < 0) throw new Error("Template not found");
      const updated: LeaseTemplate = {
        ...MOCK_TEMPLATES[index],
        ...data,
        updatedAt: new Date().toISOString(),
      } as LeaseTemplate;
      MOCK_TEMPLATES[index] = updated;
      return updated;
    }

    const token = getToken();
    const result = await apiClient.patch<BackendLeaseTemplate>(
      `/leases/templates/${templateId}`,
      data,
      token ?? undefined,
    );
    return mapBackendTemplateToTemplate(result);
  },

  delete: async (id: string): Promise<void> => {
    if (IS_MOCK_MODE) {
      await delay(DELAY);
      const index = MOCK_LEASES.findIndex((l) => l.id === id);
      if (index !== -1) {
        MOCK_LEASES.splice(index, 1);
      }
      return;
    }

    const token = getToken();
    await apiClient.delete(`/leases/${id}`, token ?? undefined);
  },

  downloadContract: async (id: string): Promise<void> => {
    if (IS_MOCK_MODE) {
      return;
    }

    const token = getToken();
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const response = await fetch(`${baseUrl}/leases/${id}/contract`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error("Contract PDF not found");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `contrato-${id}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
};
