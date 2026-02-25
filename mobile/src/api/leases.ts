import { apiClient } from '@/api/client';
import { IS_MOCK_MODE } from '@/api/env';
import { createAndShareMockPdf, downloadAndSharePdf } from '@/api/pdf';
import type { CreateLeaseInput, Lease, LeaseStatus, LeaseTemplate, UpdateLeaseInput } from '@/types/lease';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

type LeaseListFilters = {
  includeFinalized?: boolean;
  status?: Lease['status'];
  contractType?: Lease['contractType'];
};

type BackendLease = {
  id: string;
  propertyId?: string | null;
  tenantId?: string | null;
  ownerId: string;
  contractType?: 'rental' | 'sale' | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  monthlyRent?: number | null;
  securityDeposit?: number | null;
  fiscalValue?: number | null;
  currency?: string | null;
  status?: string | null;
  termsAndConditions?: string | null;
  draftContractText?: string | null;
  confirmedContractText?: string | null;
  confirmedAt?: string | Date | null;
  templateId?: string | null;
  templateName?: string | null;
  documents?: string[] | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type BackendTemplate = {
  id: string;
  name: string;
  contractType: 'rental' | 'sale';
  templateBody: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

let MOCK_LEASES: Lease[] = [
  {
    id: '1',
    propertyId: '1',
    tenantId: '1',
    ownerId: 'owner-1',
    contractType: 'rental',
    startDate: '2025-01-01',
    endDate: '2026-01-01',
    rentAmount: 150000,
    depositAmount: 150000,
    currency: 'ARS',
    status: 'DRAFT',
    draftContractText: 'Borrador de contrato base',
    documents: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let MOCK_TEMPLATES: LeaseTemplate[] = [
  {
    id: 'tpl-rental',
    name: 'Plantilla alquiler base',
    contractType: 'rental',
    templateBody: 'Contrato de alquiler de {{property.name}} para {{tenant.fullName}}',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tpl-sale',
    name: 'Plantilla compraventa base',
    contractType: 'sale',
    templateBody: 'Contrato de compraventa de {{property.name}} para {{buyer.fullName}}',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const toIso = (value?: string | Date | null): string => (value ? new Date(value).toISOString() : new Date().toISOString());

const mapStatus = (value?: string | null): LeaseStatus => {
  switch ((value ?? '').toLowerCase()) {
    case 'active':
      return 'ACTIVE';
    case 'finalized':
      return 'FINALIZED';
    default:
      return 'DRAFT';
  }
};

const mapLease = (raw: BackendLease): Lease => ({
  id: raw.id,
  propertyId: raw.propertyId ?? '',
  tenantId: raw.tenantId ?? undefined,
  ownerId: raw.ownerId,
  contractType: raw.contractType ?? 'rental',
  startDate: raw.startDate ? toIso(raw.startDate) : undefined,
  endDate: raw.endDate ? toIso(raw.endDate) : undefined,
  rentAmount: raw.monthlyRent ?? undefined,
  depositAmount: Number(raw.securityDeposit ?? 0),
  fiscalValue: raw.fiscalValue ?? undefined,
  currency: raw.currency ?? 'ARS',
  status: mapStatus(raw.status),
  terms: raw.termsAndConditions ?? undefined,
  draftContractText: raw.draftContractText ?? undefined,
  confirmedContractText: raw.confirmedContractText ?? undefined,
  confirmedAt: raw.confirmedAt ? toIso(raw.confirmedAt) : undefined,
  templateId: raw.templateId ?? undefined,
  templateName: raw.templateName ?? undefined,
  documents: Array.isArray(raw.documents) ? raw.documents : [],
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const mapTemplate = (raw: BackendTemplate): LeaseTemplate => ({
  id: raw.id,
  name: raw.name,
  contractType: raw.contractType,
  templateBody: raw.templateBody,
  isActive: raw.isActive,
  createdAt: toIso(raw.createdAt),
  updatedAt: toIso(raw.updatedAt),
});

const toCreatePayload = (value: CreateLeaseInput) => ({
  propertyId: value.propertyId,
  tenantId: value.tenantId,
  buyerProfileId: value.buyerProfileId,
  ownerId: value.ownerId,
  templateId: value.templateId,
  contractType: value.contractType,
  startDate: value.startDate,
  endDate: value.endDate,
  monthlyRent: value.rentAmount,
  securityDeposit: value.depositAmount,
  fiscalValue: value.fiscalValue,
  currency: value.currency,
  status: value.status.toLowerCase(),
  termsAndConditions: value.terms,
  paymentFrequency: value.paymentFrequency,
  paymentDueDay: value.paymentDueDay,
  billingFrequency: value.billingFrequency,
  billingDay: value.billingDay,
  autoGenerateInvoices: value.autoGenerateInvoices,
  lateFeeType: value.lateFeeType,
  lateFeeValue: value.lateFeeValue,
  lateFeeGraceDays: value.lateFeeGraceDays,
  lateFeeMax: value.lateFeeMax,
  adjustmentType: value.adjustmentType,
  adjustmentValue: value.adjustmentValue,
  adjustmentFrequencyMonths: value.adjustmentFrequencyMonths,
  inflationIndexType: value.inflationIndexType,
  nextAdjustmentDate: value.nextAdjustmentDate,
  documents: value.documents,
});

const toUpdatePayload = (value: UpdateLeaseInput) => ({
  ...toCreatePayload({
    propertyId: value.propertyId ?? '',
    tenantId: value.tenantId,
    buyerProfileId: value.buyerProfileId,
    ownerId: value.ownerId,
    templateId: value.templateId,
    contractType: value.contractType ?? 'rental',
    startDate: value.startDate,
    endDate: value.endDate,
    rentAmount: value.rentAmount,
    depositAmount: value.depositAmount ?? 0,
    fiscalValue: value.fiscalValue,
    currency: value.currency ?? 'ARS',
    status: value.status ?? 'DRAFT',
    terms: value.terms,
  }),
});

const fetchLeases = async (filters?: LeaseListFilters): Promise<Lease[]> => {
  if (IS_MOCK_MODE) {
    let leases = [...MOCK_LEASES];
    if (filters?.includeFinalized !== undefined) {
      leases = filters.includeFinalized
        ? leases.filter((item) => item.status === 'ACTIVE' || item.status === 'FINALIZED')
        : leases.filter((item) => item.status === 'ACTIVE');
    }
    if (filters?.status) {
      leases = leases.filter((item) => item.status === filters.status);
    }
    if (filters?.contractType) {
      leases = leases.filter((item) => item.contractType === filters.contractType);
    }
    return leases;
  }

  const queryParams = new URLSearchParams();
  if (filters?.includeFinalized !== undefined) {
    queryParams.append('includeFinalized', String(filters.includeFinalized));
  }
  if (filters?.status) {
    queryParams.append('status', filters.status.toLowerCase());
  }
  if (filters?.contractType) {
    queryParams.append('contractType', filters.contractType);
  }

  const endpoint = queryParams.toString().length > 0 ? `/leases?${queryParams.toString()}` : '/leases';
  const result = await apiClient.get<BackendLease[] | PaginatedResponse<BackendLease>>(endpoint);
  return Array.isArray(result) ? result.map(mapLease) : result.data.map(mapLease);
};

export const leasesApi = {
  async getAll(): Promise<Lease[]> {
    return fetchLeases();
  },

  async getAllWithFilters(filters?: LeaseListFilters): Promise<Lease[]> {
    return fetchLeases(filters);
  },

  async getById(id: string): Promise<Lease | null> {
    if (IS_MOCK_MODE) {
      return MOCK_LEASES.find((item) => item.id === id) ?? null;
    }

    try {
      const result = await apiClient.get<BackendLease>(`/leases/${id}`);
      return mapLease(result);
    } catch {
      return null;
    }
  },

  async create(payload: CreateLeaseInput): Promise<Lease> {
    if (IS_MOCK_MODE) {
      const created: Lease = {
        id: `lease-${Date.now()}`,
        propertyId: payload.propertyId,
        tenantId: payload.tenantId,
        buyerProfileId: payload.buyerProfileId,
        ownerId: payload.ownerId ?? 'owner-1',
        templateId: payload.templateId,
        contractType: payload.contractType,
        startDate: payload.startDate,
        endDate: payload.endDate,
        rentAmount: payload.rentAmount,
        depositAmount: payload.depositAmount,
        fiscalValue: payload.fiscalValue,
        currency: payload.currency,
        status: payload.status,
        terms: payload.terms,
        draftContractText: 'Borrador inicial',
        documents: payload.documents ?? [],
        paymentFrequency: payload.paymentFrequency,
        paymentDueDay: payload.paymentDueDay,
        billingFrequency: payload.billingFrequency,
        billingDay: payload.billingDay,
        autoGenerateInvoices: payload.autoGenerateInvoices,
        lateFeeType: payload.lateFeeType,
        lateFeeValue: payload.lateFeeValue,
        lateFeeGraceDays: payload.lateFeeGraceDays,
        lateFeeMax: payload.lateFeeMax,
        adjustmentType: payload.adjustmentType,
        adjustmentValue: payload.adjustmentValue,
        adjustmentFrequencyMonths: payload.adjustmentFrequencyMonths,
        inflationIndexType: payload.inflationIndexType,
        nextAdjustmentDate: payload.nextAdjustmentDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      MOCK_LEASES = [created, ...MOCK_LEASES];
      return created;
    }

    const result = await apiClient.post<BackendLease>('/leases', toCreatePayload(payload));
    return mapLease(result);
  },

  async update(id: string, payload: UpdateLeaseInput): Promise<Lease> {
    if (IS_MOCK_MODE) {
      const index = MOCK_LEASES.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new Error('Lease not found');
      }

      const updated: Lease = {
        ...MOCK_LEASES[index],
        ...payload,
        updatedAt: new Date().toISOString(),
      };
      MOCK_LEASES[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendLease>(`/leases/${id}`, toUpdatePayload(payload));
    return mapLease(result);
  },

  async delete(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_LEASES = MOCK_LEASES.filter((item) => item.id !== id);
      return;
    }

    await apiClient.delete(`/leases/${id}`);
  },

  async getTemplates(contractType?: Lease['contractType']): Promise<LeaseTemplate[]> {
    if (IS_MOCK_MODE) {
      return contractType ? MOCK_TEMPLATES.filter((item) => item.contractType === contractType) : [...MOCK_TEMPLATES];
    }

    const query = contractType ? `?contractType=${contractType}` : '';
    const result = await apiClient.get<BackendTemplate[]>(`/leases/templates${query}`);
    return result.map(mapTemplate);
  },

  async createTemplate(data: {
    name: string;
    contractType: Lease['contractType'];
    templateBody: string;
    isActive?: boolean;
  }): Promise<LeaseTemplate> {
    if (IS_MOCK_MODE) {
      const created: LeaseTemplate = {
        id: `tpl-${Date.now()}`,
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

    const result = await apiClient.post<BackendTemplate>('/leases/templates', data);
    return mapTemplate(result);
  },

  async updateTemplate(
    templateId: string,
    data: Partial<{
      name: string;
      contractType: Lease['contractType'];
      templateBody: string;
      isActive: boolean;
    }>,
  ): Promise<LeaseTemplate> {
    if (IS_MOCK_MODE) {
      const index = MOCK_TEMPLATES.findIndex((item) => item.id === templateId);
      if (index < 0) {
        throw new Error('Template not found');
      }

      const updated: LeaseTemplate = {
        ...MOCK_TEMPLATES[index],
        ...data,
        updatedAt: new Date().toISOString(),
      } as LeaseTemplate;
      MOCK_TEMPLATES[index] = updated;
      return updated;
    }

    const result = await apiClient.patch<BackendTemplate>(`/leases/templates/${templateId}`, data);
    return mapTemplate(result);
  },

  async deleteTemplate(templateId: string): Promise<void> {
    if (IS_MOCK_MODE) {
      MOCK_TEMPLATES = MOCK_TEMPLATES.filter((item) => item.id !== templateId);
      return;
    }

    await apiClient.delete(`/leases/templates/${templateId}`);
  },

  async renderDraft(id: string, templateId?: string): Promise<Lease> {
    if (IS_MOCK_MODE) {
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) {
        throw new Error('Lease not found');
      }

      const template =
        MOCK_TEMPLATES.find((item) => item.id === templateId) ??
        MOCK_TEMPLATES.find((item) => item.contractType === lease.contractType);
      if (!template) {
        throw new Error('Template not found');
      }

      lease.templateId = template.id;
      lease.templateName = template.name;
      lease.draftContractText = template.templateBody;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const result = await apiClient.post<BackendLease>(`/leases/${id}/draft/render`, { templateId });
    return mapLease(result);
  },

  async updateDraftText(id: string, draftText: string): Promise<Lease> {
    if (IS_MOCK_MODE) {
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) {
        throw new Error('Lease not found');
      }

      lease.draftContractText = draftText;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const result = await apiClient.patch<BackendLease>(`/leases/${id}/draft-text`, { draftText });
    return mapLease(result);
  },

  async confirmDraft(id: string, finalText?: string): Promise<Lease> {
    if (IS_MOCK_MODE) {
      const lease = MOCK_LEASES.find((item) => item.id === id);
      if (!lease) {
        throw new Error('Lease not found');
      }

      lease.status = 'ACTIVE';
      lease.confirmedAt = new Date().toISOString();
      lease.confirmedContractText = finalText ?? lease.draftContractText;
      lease.updatedAt = new Date().toISOString();
      return lease;
    }

    const result = await apiClient.post<BackendLease>(`/leases/${id}/confirm`, { finalText });
    return mapLease(result);
  },

  async downloadContract(id: string): Promise<void> {
    if (IS_MOCK_MODE) {
      await createAndShareMockPdf(`contrato-${id}`, `Contrato mock para lease ${id}`);
      return;
    }

    await downloadAndSharePdf({
      relativePath: `/leases/${id}/contract`,
      filenamePrefix: `contrato-${id}`,
    });
  },
};
