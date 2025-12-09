import { Property, CreatePropertyInput, UpdatePropertyInput } from '@/types/property';
import { apiClient } from '../api';
import { getToken } from '../auth';

// Mock data for development/testing
const MOCK_PROPERTIES: Property[] = [
    {
        id: '1',
        name: 'Edificio Central',
        description: 'Edificio de oficinas en el centro',
        type: 'OFFICE',
        status: 'ACTIVE',
        address: {
            street: 'Av. Principal',
            number: '123',
            city: 'Ciudad',
            state: 'Estado',
            zipCode: '12345',
            country: 'País',
        },
        features: [],
        units: [],
        images: ['/placeholder-property.svg'],
        ownerId: 'owner1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: '2',
        name: 'Casa Los Pinos',
        description: 'Hermosa casa familiar',
        type: 'HOUSE',
        status: 'ACTIVE',
        address: {
            street: 'Los Pinos',
            number: '456',
            city: 'Ciudad',
            state: 'Estado',
            zipCode: '12345',
            country: 'País',
        },
        features: [],
        units: [],
        images: ['/placeholder-property.svg'],
        ownerId: 'owner2',
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

export const propertiesApi = {
    getAll: async (): Promise<Property[]> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_PROPERTIES;
        }
        
        const token = getToken();
        return apiClient.get<Property[]>('/properties', token ?? undefined);
    },

    getById: async (id: string): Promise<Property | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_PROPERTIES.find((p) => p.id === id) || null;
        }
        
        const token = getToken();
        try {
            return await apiClient.get<Property>(`/properties/${id}`, token ?? undefined);
        } catch {
            return null;
        }
    },

    create: async (data: CreatePropertyInput): Promise<Property> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const newProperty: Property = {
                ...data,
                images: data.images || [],
                id: Math.random().toString(36).substr(2, 9),
                status: 'ACTIVE',
                features: (data.features || []).map(f => ({ ...f, id: Math.random().toString(36).substr(2, 9) })),
                units: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            MOCK_PROPERTIES.push(newProperty);
            return newProperty;
        }
        
        const token = getToken();
        return apiClient.post<Property>('/properties', data, token ?? undefined);
    },

    update: async (id: string, data: UpdatePropertyInput): Promise<Property> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_PROPERTIES.findIndex((p) => p.id === id);
            if (index === -1) throw new Error('Property not found');

            const updatedFeatures = data.features 
                ? data.features.map(f => ({ ...f, id: Math.random().toString(36).substr(2, 9) }))
                : MOCK_PROPERTIES[index].features;

            const updatedProperty: Property = {
                ...MOCK_PROPERTIES[index],
                ...data,
                features: updatedFeatures,
                updatedAt: new Date().toISOString(),
            };
            MOCK_PROPERTIES[index] = updatedProperty;
            return updatedProperty;
        }
        
        const token = getToken();
        return apiClient.patch<Property>(`/properties/${id}`, data, token ?? undefined);
    },

    delete: async (id: string): Promise<void> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            const index = MOCK_PROPERTIES.findIndex((p) => p.id === id);
            if (index !== -1) {
                MOCK_PROPERTIES.splice(index, 1);
            }
            return;
        }
        
        const token = getToken();
        await apiClient.delete(`/properties/${id}`, token ?? undefined);
    },

    uploadImage: async (file: File): Promise<string> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return URL.createObjectURL(file);
        }
        
        const token = getToken();
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.upload<string>('/properties/upload', formData, token ?? undefined);
    }
};
