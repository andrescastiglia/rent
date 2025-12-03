import { Property, CreatePropertyInput, UpdatePropertyInput } from '@/types/property';

// Mock data for development
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

const DELAY = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const propertiesApi = {
    getAll: async (): Promise<Property[]> => {
        await delay(DELAY);
        return MOCK_PROPERTIES;
    },

    getById: async (id: string): Promise<Property | null> => {
        await delay(DELAY);
        return MOCK_PROPERTIES.find((p) => p.id === id) || null;
    },

    create: async (data: CreatePropertyInput): Promise<Property> => {
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
    },

    update: async (id: string, data: UpdatePropertyInput): Promise<Property> => {
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
    },

    delete: async (id: string): Promise<void> => {
        await delay(DELAY);
        const index = MOCK_PROPERTIES.findIndex((p) => p.id === id);
        if (index !== -1) {
            MOCK_PROPERTIES.splice(index, 1);
        }
    },

    uploadImage: async (file: File): Promise<string> => {
        await delay(DELAY);
        // In a real app, this would upload to S3/Cloudinary
        // For now, we return a fake URL
        return URL.createObjectURL(file);
    }
};
