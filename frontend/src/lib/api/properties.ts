import { Property, CreatePropertyInput, UpdatePropertyInput } from '@/types/property';
import { apiClient } from '../api';
import { getToken } from '../auth';

type PaginatedResponse<T> = { data: T[]; total: number; page: number; limit: number };

type BackendUnit = {
    id: string;
    unitNumber: string;
    floor?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area?: number | null;
    status?: string | null;
    baseRent?: number | null;
};

type BackendProperty = {
    id: string;
    name: string;
    description?: string | null;
    propertyType?: string | null;
    status?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressPostalCode?: string | null;
    addressCountry?: string | null;
    images?: any[] | null;
    ownerId?: string | null;
    units?: BackendUnit[] | null;
    features?: any[] | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
};

const isPaginatedResponse = <T,>(value: any): value is PaginatedResponse<T> => {
    return !!value && typeof value === 'object' && Array.isArray(value.data);
};

const normalizeImages = (images: any[] | null | undefined): string[] => {
    if (!Array.isArray(images)) return [];
    return images
        .map((img) => {
            if (typeof img === 'string') return img;
            if (img && typeof img === 'object') {
                if (typeof img.url === 'string') return img.url;
                if (typeof img.path === 'string') return img.path;
            }
            return null;
        })
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
};

const mapPropertyType = (value: string | null | undefined): Property['type'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'apartment':
            return 'APARTMENT';
        case 'house':
            return 'HOUSE';
        case 'commercial':
            return 'COMMERCIAL';
        case 'office':
            return 'OFFICE';
        case 'land':
            return 'LAND';
        default:
            return 'OTHER';
    }
};

const mapPropertyStatus = (value: string | null | undefined): Property['status'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'active':
            return 'ACTIVE';
        case 'under_maintenance':
        case 'maintenance':
            return 'MAINTENANCE';
        default:
            return 'INACTIVE';
    }
};

const mapUnitStatus = (value: string | null | undefined): Property['units'][number]['status'] => {
    switch ((value ?? '').toLowerCase()) {
        case 'available':
            return 'AVAILABLE';
        case 'occupied':
            return 'OCCUPIED';
        case 'maintenance':
            return 'MAINTENANCE';
        default:
            return 'AVAILABLE';
    }
};

const mapBackendUnitToUnit = (raw: BackendUnit): Property['units'][number] => {
    return {
        id: raw.id,
        unitNumber: raw.unitNumber,
        floor: raw.floor ?? undefined,
        bedrooms: Number(raw.bedrooms ?? 0),
        bathrooms: Number(raw.bathrooms ?? 0),
        area: Number(raw.area ?? 0),
        status: mapUnitStatus(raw.status),
        rentAmount: Number(raw.baseRent ?? 0),
    };
};

const mapBackendPropertyToProperty = (raw: BackendProperty): Property => {
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description ?? undefined,
        type: mapPropertyType(raw.propertyType),
        status: mapPropertyStatus(raw.status),
        address: {
            street: raw.addressStreet ?? '',
            number: raw.addressNumber ?? '',
            unit: undefined,
            city: raw.addressCity ?? '',
            state: raw.addressState ?? '',
            zipCode: raw.addressPostalCode ?? '',
            country: raw.addressCountry ?? 'Argentina',
        },
        features: Array.isArray(raw.features)
            ? raw.features
                  .map((f: any) => {
                      const id = typeof f?.id === 'string' ? f.id : Math.random().toString(36).slice(2);
                      const name = typeof f?.name === 'string' ? f.name : String(f?.featureName ?? f?.key ?? '');
                      const value = typeof f?.value === 'string' ? f.value : undefined;
                      return { id, name, value };
                  })
                  .filter((f) => !!f.name)
            : [],
        units: Array.isArray(raw.units) ? raw.units.map(mapBackendUnitToUnit) : [],
        images: normalizeImages(raw.images),
        ownerId: raw.ownerId ?? '',
        createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
    };
};

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
        const result = await apiClient.get<PaginatedResponse<BackendProperty> | BackendProperty[] | any>(
            '/properties',
            token ?? undefined,
        );

        if (Array.isArray(result)) {
            return result.map(mapBackendPropertyToProperty);
        }

        if (isPaginatedResponse<BackendProperty>(result)) {
            return result.data.map(mapBackendPropertyToProperty);
        }

        throw new Error('Unexpected response shape from /properties');
    },

    getById: async (id: string): Promise<Property | null> => {
        if (IS_MOCK_MODE) {
            await delay(DELAY);
            return MOCK_PROPERTIES.find((p) => p.id === id) || null;
        }
        
        const token = getToken();
        try {
            const result = await apiClient.get<BackendProperty>(`/properties/${id}`, token ?? undefined);
            return mapBackendPropertyToProperty(result);
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
