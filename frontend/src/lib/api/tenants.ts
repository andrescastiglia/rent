import { Tenant, CreateTenantInput, UpdateTenantInput } from '@/types/tenant';

// Mock data for development
const MOCK_TENANTS: Tenant[] = [
    {
        id: '1',
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan.perez@example.com',
        phone: '+54 9 11 1234-5678',
        dni: '12345678',
        status: 'ACTIVE',
        address: {
            street: 'Av. Corrientes',
            number: '1000',
            city: 'Buenos Aires',
            state: 'CABA',
            zipCode: '1000',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        firstName: 'María',
        lastName: 'Gómez',
        email: 'maria.gomez@example.com',
        phone: '+54 9 11 8765-4321',
        dni: '87654321',
        status: 'PROSPECT',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const DELAY = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const tenantsApi = {
    getAll: async (): Promise<Tenant[]> => {
        await delay(DELAY);
        return MOCK_TENANTS;
    },

    getById: async (id: string): Promise<Tenant | null> => {
        await delay(DELAY);
        return MOCK_TENANTS.find((t) => t.id === id) || null;
    },

    create: async (data: CreateTenantInput): Promise<Tenant> => {
        await delay(DELAY);
        const newTenant: Tenant = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        MOCK_TENANTS.push(newTenant);
        return newTenant;
    },

    update: async (id: string, data: UpdateTenantInput): Promise<Tenant> => {
        await delay(DELAY);
        const index = MOCK_TENANTS.findIndex((t) => t.id === id);
        if (index === -1) throw new Error('Tenant not found');

        const updatedTenant = {
            ...MOCK_TENANTS[index],
            ...data,
            updatedAt: new Date().toISOString(),
        };
        MOCK_TENANTS[index] = updatedTenant;
        return updatedTenant;
    },

    delete: async (id: string): Promise<void> => {
        await delay(DELAY);
        const index = MOCK_TENANTS.findIndex((t) => t.id === id);
        if (index !== -1) {
            MOCK_TENANTS.splice(index, 1);
        }
    },
};
