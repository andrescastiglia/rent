import { Owner } from '@/types/owner';

// Mock data for development
const MOCK_OWNERS: Owner[] = [
    {
        id: '1',
        userId: 'user-1',
        companyId: 'company-1',
        firstName: 'Carlos',
        lastName: 'Rodríguez',
        email: 'carlos.rodriguez@example.com',
        phone: '+54 9 11 5555-1234',
        taxId: '20-12345678-9',
        taxIdType: 'CUIT',
        bankName: 'Banco Nación',
        bankCbu: '0110000000000000000001',
        bankAlias: 'carlos.rodriguez',
        paymentMethod: 'bank_transfer',
        commissionRate: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        userId: 'user-2',
        companyId: 'company-1',
        firstName: 'Ana',
        lastName: 'Martínez',
        email: 'ana.martinez@example.com',
        phone: '+54 9 11 5555-5678',
        taxId: '27-98765432-1',
        taxIdType: 'CUIT',
        bankName: 'Banco Galicia',
        bankCbu: '0110000000000000000002',
        bankAlias: 'ana.martinez.alquileres',
        paymentMethod: 'bank_transfer',
        commissionRate: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const DELAY = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const ownersApi = {
    getAll: async (): Promise<Owner[]> => {
        await delay(DELAY);
        return MOCK_OWNERS;
    },

    getById: async (id: string): Promise<Owner | null> => {
        await delay(DELAY);
        return MOCK_OWNERS.find((o) => o.id === id) || null;
    },
};
