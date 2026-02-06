import { Lease, CreateLeaseInput, UpdateLeaseInput } from '@/types/lease';
import type { Property } from '@/types/property';
import type { Tenant } from '@/types/tenant';
import { apiClient } from '../api';
import { getToken, getUser } from '../auth';
import { propertiesApi } from './properties';
import { tenantsApi } from './tenants';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

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

type BackendUnit = {
    id: string;
    propertyId?: string | null;
    unitNumber?: string | null;
    floor?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area?: number | null;
    status?: string | null;
    baseRent?: number | null;
    property?: any;
};

type BackendLease = {
    id: string;
    unitId: string;
    tenantId: string;
    ownerId: string;
    startDate: string | Date;
    endDate: string | Date;
    monthlyRent?: number | null;
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
    documents?: any[] | null;
    unit?: BackendUnit | null;
    tenant?: BackendTenant | null;
};

type BackendLeasePayload = {
    companyId?: string;
    unitId?: string;
    tenantId?: string;
    ownerId?: string;
    startDate?: string;
    endDate?: string;
    monthlyRent?: number;
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
};

const isPaginatedResponse = <T,>(value: any): value is PaginatedResponse<T> => {
    return !!value && typeof value === 'object' && Array.isArray(value.data);
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
    if (data.unitId !== undefined) payload.unitId = data.unitId;
    if (data.tenantId !== undefined) payload.tenantId = data.tenantId;
    if (data.ownerId !== undefined) payload.ownerId = data.ownerId;
    if (data.startDate !== undefined) payload.startDate = data.startDate;
    if (data.endDate !== undefined) payload.endDate = data.endDate;
    if (data.rentAmount !== undefined) payload.monthlyRent = data.rentAmount;
    if (data.depositAmount !== undefined) payload.securityDeposit = data.depositAmount;
    if (data.currency !== undefined) payload.currency = data.currency;
    if (data.paymentFrequency !== undefined) payload.paymentFrequency = data.paymentFrequency;
    if (data.paymentDueDay !== undefined) payload.paymentDueDay = data.paymentDueDay;
    if (data.billingFrequency !== undefined) payload.billingFrequency = data.billingFrequency;
    if (data.billingDay !== undefined) payload.billingDay = data.billingDay;
    if (data.autoGenerateInvoices !== undefined) payload.autoGenerateInvoices = data.autoGenerateInvoices;
    if (data.lateFeeType !== undefined) payload.lateFeeType = data.lateFeeType;
    if (data.lateFeeValue !== undefined) payload.lateFeeValue = data.lateFeeValue;
    if (data.lateFeeGraceDays !== undefined) payload.lateFeeGraceDays = data.lateFeeGraceDays;
    if (data.lateFeeMax !== undefined) payload.lateFeeMax = data.lateFeeMax;
    if (data.adjustmentType !== undefined) payload.adjustmentType = data.adjustmentType;
    if (data.adjustmentValue !== undefined) payload.adjustmentValue = data.adjustmentValue;
    if (data.adjustmentFrequencyMonths !== undefined) {
        payload.adjustmentFrequencyMonths = data.adjustmentFrequencyMonths;
    }
    if (data.inflationIndexType !== undefined) payload.inflationIndexType = data.inflationIndexType;
    if (data.nextAdjustmentDate !== undefined) payload.nextAdjustmentDate = data.nextAdjustmentDate;
    if (data.terms !== undefined) payload.termsAndConditions = data.terms;
    return payload;
};

const mapLeaseStatus = (value: string | null | undefined): Lease['status'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'active':
            return 'ACTIVE';
        case 'terminated':
            return 'TERMINATED';
        case 'expired':
        case 'ended':
            return 'ENDED';
        case 'draft':
        default:
            return 'DRAFT';
    }
};

const mapBackendLeaseToLease = (raw: BackendLease): Lease => {
    const unit = raw.unit ?? null;
    const propertyId = unit?.propertyId ?? '';

    const tenantUser = raw.tenant?.user ?? null;
    const tenant: Tenant | undefined = tenantUser
        ? {
              id: raw.tenantId,
              firstName: tenantUser.firstName ?? '',
              lastName: tenantUser.lastName ?? '',
              email: tenantUser.email ?? '',
              phone: tenantUser.phone ?? '',
              dni: raw.tenant?.dni ?? raw.tenantId,
              status: (tenantUser.isActive ?? true) ? 'ACTIVE' : 'INACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
          }
        : undefined;

    const property: Property | undefined = unit?.property
        ? {
              id: unit.property.id,
              name: unit.property.name ?? '',
              description: unit.property.description ?? undefined,
              type: 'OTHER',
              status: 'ACTIVE',
              address: {
                  street: unit.property.addressStreet ?? '',
                  number: unit.property.addressNumber ?? '',
                  unit: undefined,
                  city: unit.property.addressCity ?? '',
                  state: unit.property.addressState ?? '',
                  zipCode: unit.property.addressPostalCode ?? '',
                  country: unit.property.addressCountry ?? 'Argentina',
              },
              features: [],
              units: [],
              images: Array.isArray(unit.property.images)
                  ? unit.property.images
                        .map((img: any) => (typeof img === 'string' ? img : img?.url))
                        .filter((v: any) => typeof v === 'string' && v.length > 0)
                  : [],
              ownerId: unit.property.ownerId ?? raw.ownerId,
              createdAt: unit.property.createdAt
                  ? new Date(unit.property.createdAt).toISOString()
                  : new Date().toISOString(),
              updatedAt: unit.property.updatedAt
                  ? new Date(unit.property.updatedAt).toISOString()
                  : new Date().toISOString(),
          }
        : undefined;

    return {
        id: raw.id,
        propertyId,
        unitId: raw.unitId,
        tenantId: raw.tenantId,
        ownerId: raw.ownerId,
        startDate: normalizeDate(raw.startDate),
        endDate: normalizeDate(raw.endDate),
        rentAmount: Number(raw.monthlyRent ?? 0),
        depositAmount: Number(raw.securityDeposit ?? 0),
        currency: raw.currency ?? 'ARS',
        status: mapLeaseStatus(raw.status),
        terms: raw.termsAndConditions ?? undefined,
        documents: Array.isArray(raw.documents) ? raw.documents.filter((d) => typeof d === 'string') : [],
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
        inflationIndexType: (raw.inflationIndexType as any) ?? undefined,
        nextAdjustmentDate: raw.nextAdjustmentDate ? normalizeDate(raw.nextAdjustmentDate) : undefined,
        lastAdjustmentDate: raw.lastAdjustmentDate ? normalizeDate(raw.lastAdjustmentDate) : undefined,
        property,
        unit: unit
            ? {
                  id: unit.id,
                  unitNumber: unit.unitNumber ?? '',
                  floor: unit.floor ?? undefined,
                  bedrooms: Number(unit.bedrooms ?? 0),
                  bathrooms: Number(unit.bathrooms ?? 0),
                  area: Number(unit.area ?? 0),
                  status: (unit.status ?? 'available').toUpperCase() as any,
                  rentAmount: Number(unit.baseRent ?? 0),
              }
            : undefined,
        tenant,
    };
};

// Mock data for development/testing
const MOCK_LEASES: Lease[] = [
    {
        id: '1',
        propertyId: '1',
        unitId: 'u1',
        tenantId: '1',
        ownerId: 'owner-1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        rentAmount: 1500,
        depositAmount: 3000,
        currency: 'ARS',
        currencyData: { code: 'ARS', symbol: '$', decimalPlaces: 2, isActive: true },
        status: 'ACTIVE',
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        propertyId: '2',
        unitId: 'u2',
        tenantId: '2',
        ownerId: 'owner-2',
        startDate: '2024-03-01',
        endDate: '2025-02-28',
        rentAmount: 2000,
        depositAmount: 4000,
        currency: 'USD',
        currencyData: { code: 'USD', symbol: 'US$', decimalPlaces: 2, isActive: true },
        status: 'DRAFT',
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

// Use mock data in test/CI environments, real API in production
const IS_MOCK_MODE = process.env.NODE_ENV === 'test' || 
                     process.env.NEXT_PUBLIC_MOCK_MODE === 'true' || 
                     process.env.CI === 'true';

const DELAY = 500;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const leasesApi = {
    getAll: async (): Promise<Lease[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            // Enrich with related data for list view
            const leasesWithRelations = await Promise.all(MOCK_LEASES.map(async (lease) => {
                const property = await propertiesApi.getById(lease.propertyId);
                const tenant = await tenantsApi.getById(lease.tenantId);
                return { ...lease, property: property || undefined, tenant: tenant || undefined };
            }));
            return leasesWithRelations;
        }
        
        const token = getToken();
        const result = await apiClient.get<PaginatedResponse<BackendLease> | BackendLease[] | any>(
            '/leases',
            token ?? undefined,
        );

        if (Array.isArray(result)) {
            return result.map(mapBackendLeaseToLease);
        }

        if (isPaginatedResponse<BackendLease>(result)) {
            return result.data.map(mapBackendLeaseToLease);
        }

        throw new Error('Unexpected response shape from /leases');
    },

    getById: async (id: string): Promise<Lease | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const lease = MOCK_LEASES.find((l) => l.id === id);
            if (!lease) return null;

            const property = await propertiesApi.getById(lease.propertyId);
            const tenant = await tenantsApi.getById(lease.tenantId);
            return { ...lease, property: property || undefined, tenant: tenant || undefined };
        }
        
        const token = getToken();
        try {
            const result = await apiClient.get<BackendLease>(`/leases/${id}`, token ?? undefined);
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
            '/leases',
            payload,
            token ?? undefined,
        );
        return mapBackendLeaseToLease(result);
    },

    update: async (id: string, data: UpdateLeaseInput): Promise<Lease> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_LEASES.findIndex((l) => l.id === id);
            if (index === -1) throw new Error('Lease not found');

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
};
