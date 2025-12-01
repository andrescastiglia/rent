import { Lease, CreateLeaseInput, UpdateLeaseInput } from '@/types/lease';
import { propertiesApi } from './properties';
import { tenantsApi } from './tenants';

// Mock data for development
const MOCK_LEASES: Lease[] = [
    {
        id: '1',
        propertyId: '1',
        unitId: 'u1',
        tenantId: '1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        rentAmount: 1500,
        depositAmount: 3000,
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
        startDate: '2024-03-01',
        endDate: '2025-02-28',
        rentAmount: 2000,
        depositAmount: 4000,
        status: 'DRAFT',
        documents: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const DELAY = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const leasesApi = {
    getAll: async (): Promise<Lease[]> => {
        await delay(DELAY);
        // Enrich with related data for list view
        const leasesWithRelations = await Promise.all(MOCK_LEASES.map(async (lease) => {
            const property = await propertiesApi.getById(lease.propertyId);
            const tenant = await tenantsApi.getById(lease.tenantId);
            return { ...lease, property: property || undefined, tenant: tenant || undefined };
        }));
        return leasesWithRelations;
    },

    getById: async (id: string): Promise<Lease | null> => {
        await delay(DELAY);
        const lease = MOCK_LEASES.find((l) => l.id === id);
        if (!lease) return null;

        const property = await propertiesApi.getById(lease.propertyId);
        const tenant = await tenantsApi.getById(lease.tenantId);
        return { ...lease, property: property || undefined, tenant: tenant || undefined };
    },

    create: async (data: CreateLeaseInput): Promise<Lease> => {
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
    },

    update: async (id: string, data: UpdateLeaseInput): Promise<Lease> => {
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
    },

    delete: async (id: string): Promise<void> => {
        await delay(DELAY);
        const index = MOCK_LEASES.findIndex((l) => l.id === id);
        if (index !== -1) {
            MOCK_LEASES.splice(index, 1);
        }
    },
};
